import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const DocumentScanner = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const [jscanifyLoaded, setJscanifyLoaded] = useState(false);
  // const [ocrLoaded, setOcrLoaded] = useState(false);
  const [extractedData, setExtractedData] = useState<Record<string, string>>({});
  const [_openCVLoaded, setOpenCVLoaded] = useState(false);
  const [savedData, setSavedData] = useState<Record<string, string>>({});

  // Hàm tắt camera
  const stopCamera = () => {
    console.log("Attempting to stop camera...");
    if (videoRef.current) {
      console.log("videoRef exists, srcObject:", videoRef.current.srcObject);
      if (videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        console.log("Found tracks:", tracks.length);
        tracks.forEach((track) => {
          console.log("Stopping track:", track.kind);
          track.stop();
        });
        videoRef.current.srcObject = null;
        console.log("Camera stopped successfully");
      }
    } else {
      console.log("videoRef is null");
    }
  };

  // Mở camera và check jscanify
  useEffect(() => {
    const initializeScanner = async () => {
      // Chờ OpenCV load trước
      let cvAttempts = 0;
      const checkOpenCV = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if ((window as any).cv && (window as any).cv.Mat) {
            console.log("OpenCV loaded successfully");
            setOpenCVLoaded(true);
            resolve(true);
          } else if (cvAttempts < 100) {
            cvAttempts++;
            setTimeout(() => resolve(checkOpenCV()), 100);
          } else {
            console.error("OpenCV không thể load");
            resolve(false);
          }
        });
      };

      await checkOpenCV();

      // Chờ jscanify load từ CDN
      let jsAttempts = 0;
      const checkJscanify = () => {
        if ((window as any).jscanify) {
          setJscanifyLoaded(true);
          console.log("Jscanify loaded successfully");
        } else if (jsAttempts < 50) {
          jsAttempts++;
          setTimeout(checkJscanify, 100);
        } else {
          console.error("Jscanify không thể load từ CDN");
        }
      };

      checkJscanify();

      // Mở camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        alert("Không thể mở camera. Hãy kiểm tra quyền truy cập.");
      }
    };

    initializeScanner();

    // Cleanup khi component unmount
    return () => {
      stopCamera();
    };
  }, []);

  // Cleanup camera khi user rời khỏi trang (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log("beforeunload event triggered");
      stopCamera();
    };

    // Also listen for visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("Page hidden, stopping camera");
        stopCamera();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      console.log("Cleanup useEffect running");
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopCamera();
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current || !rawCanvasRef.current || !outputCanvasRef.current)
      return;

    const video = videoRef.current;
    const raw = rawCanvasRef.current;
    const output = outputCanvasRef.current;

    raw.width = video.videoWidth;
    raw.height = video.videoHeight;

    const ctx = raw.getContext("2d");
    if (!ctx) return;

    // 1. Chụp frame từ camera
    ctx.drawImage(video, 0, 0, raw.width, raw.height);

    // Debug: Kiểm tra xem raw canvas có data không
    const rawImageData = ctx.getImageData(0, 0, 1, 1);
    console.log("Raw canvas data sample (first pixel):", rawImageData.data);
    const hasData = rawImageData.data.some(val => val !== 0);
    console.log("Raw canvas has data:", hasData);

    // 2. Xử lý bằng jscanify
    const jscanify = (window as any).jscanify;
    const cv = (window as any).cv;

    if (!jscanify || !jscanifyLoaded) {
      alert("Jscanify chưa được tải. Vui lòng thử lại.");
      return;
    }

    if (!cv || !cv.Mat) {
      alert("OpenCV chưa được tải. Vui lòng thử lại.");
      return;
    }

    try {
      const scan = new jscanify();
      console.log("Scan instance:", scan);

      // Thử các method khác nhau
      // 1. Đầu tiên, thử capture (nếu có)
      let result;

      // Thử phương pháp 1: capture
      if (typeof scan.capture === 'function') {
        result = scan.capture(raw);
        console.log("Using capture method:", result);
      }
      // Thử phương pháp 2: extractPaper không tham số
      else if (typeof scan.extractPaper === 'function') {
        result = scan.extractPaper(raw);
        console.log("Using extractPaper method:", result);
      }
      // Thử phương pháp 3: scan (tên generic)
      else if (typeof scan.scan === 'function') {
        result = scan.scan(raw);
        console.log("Using scan method:", result);
      }

      if (!result) {
        alert("Không thể xử lý hình ảnh. Thử lại.");
        return;
      }

      console.log("Result type:", typeof result, result instanceof HTMLCanvasElement, result.data);

      // Nếu result là canvas
      if (result instanceof HTMLCanvasElement) {
        const outCtx = output.getContext("2d");
        if (!outCtx) return;

        output.width = result.width;
        output.height = result.height;

        const srcCtx = result.getContext("2d");
        if (srcCtx) {
          const imageData = srcCtx.getImageData(0, 0, result.width, result.height);
          // Debug: Log result canvas data
          console.log("Result canvas size:", result.width, "x", result.height);
          console.log("Result imageData sample:", imageData.data.slice(0, 10));
          outCtx.putImageData(imageData, 0, 0);
          console.log("Canvas copied successfully");
        }
      }
      // Nếu result là imageData
      else if (result.data) {
        const outCtx = output.getContext("2d");
        if (!outCtx) return;

        output.width = result.width || raw.width;
        output.height = result.height || raw.height;
        console.log("Result size:", output.width, "x", output.height);
        outCtx.putImageData(result, 0, 0);
        console.log("ImageData copied successfully");
      }

      // Fallback: Nếu tidak work, coba copy raw image to output
      if (!output.getContext("2d")?.getImageData(0, 0, 1, 1).data.some((v: number) => v !== 0)) {
        console.log("Result empty, copying raw canvas as fallback");
        const fallbackCtx = output.getContext("2d");
        if (fallbackCtx) {
          fallbackCtx.drawImage(raw, 0, 0);
        }
      }

      console.log("Scan thành công!");

      // Sau khi scan xong, tự động chạy OCR
      performOCR(output);
    } catch (error) {
      console.error("Lỗi xử lý hình ảnh:", error);
      console.error("Error message:", (error as Error).message);
      alert(`Có lỗi xảy ra: ${(error as Error).message}`);
    }
  };

  // Hàm thực hiện OCR và trích xuất dữ liệu
  const performOCR = async (canvas: HTMLCanvasElement) => {
    const tesseract = (window as any).Tesseract;

    if (!tesseract) {
      alert("Tesseract chưa được tải. Vui lòng thử lại.");
      return;
    }

    try {
      console.log("Starting OCR...");

      // Tăng độ phân giải canvas để OCR đọc tốt hơn từ xa
      const upscaledCanvas = document.createElement('canvas');
      const scale = 2; // Tăng 2x độ phân giải
      upscaledCanvas.width = canvas.width * scale;
      upscaledCanvas.height = canvas.height * scale;

      const upscaledCtx = upscaledCanvas.getContext('2d');
      if (upscaledCtx) {
        upscaledCtx.imageSmoothingEnabled = true;
        upscaledCtx.imageSmoothingQuality = 'high';
        upscaledCtx.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);
      }

      // Áp dụng preprocessing: làm nét ảnh + tăng độ tương phản
      const processedCanvas = document.createElement('canvas');
      processedCanvas.width = upscaledCanvas.width;
      processedCanvas.height = upscaledCanvas.height;

      const processedCtx = processedCanvas.getContext('2d');
      if (processedCtx) {
        processedCtx.drawImage(upscaledCanvas, 0, 0);

        // Lấy image data
        const imageData = processedCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
        const data = imageData.data;
        const width = processedCanvas.width;
        const height = processedCanvas.height;

        // Bước 1: Làm nét ảnh bằng unsharp masking
        const sharpKernel = [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ];

        // Tính toán convolution cho sharpening
        const tempData = new Uint8ClampedArray(data);
        for (let i = 0; i < data.length; i += 4) {
          const pixelIndex = i / 4;
          const x = pixelIndex % width;
          const y = Math.floor(pixelIndex / width);

          if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
            let r = 0, g = 0, b = 0;

            // Áp dụng kernel
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const kernelIndex = (ky + 1) * 3 + (kx + 1);
                const neighborPixelIndex = ((y + ky) * width + (x + kx)) * 4;
                const weight = sharpKernel[kernelIndex];

                r += tempData[neighborPixelIndex] * weight;
                g += tempData[neighborPixelIndex + 1] * weight;
                b += tempData[neighborPixelIndex + 2] * weight;
              }
            }

            // Normalize và clamp
            data[i] = Math.max(0, Math.min(255, r / 1));
            data[i + 1] = Math.max(0, Math.min(255, g / 1));
            data[i + 2] = Math.max(0, Math.min(255, b / 1));
          }
        }

        // Bước 2: Tăng độ tương phản
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const factor = brightness > 128 ? 1.4 : 0.6; // Tăng tương phản mạnh hơn

          data[i] = Math.min(255, data[i] * factor); // R
          data[i + 1] = Math.min(255, data[i + 1] * factor); // G
          data[i + 2] = Math.min(255, data[i + 2] * factor); // B
        }

        processedCtx.putImageData(imageData, 0, 0);
      }

      // Chuyển processed canvas thành blob
      processedCanvas.toBlob(async (blob) => {
        if (!blob) return;

        // Sử dụng psm: 6 (Assume single uniform block of text) để tốt hơn với document

        const { data: { text } } = await tesseract.recognize(blob, "vie+eng", {
          tessedit_pageseg_mode: 6
        });
        console.log("OCR Raw Text:", text);

        // Lưu raw OCR text để hiển thị
        const data: Record<string, string> = {};
        data['_raw_text'] = text;

        // Các chỉ số cần tìm
        const indicators = ['FT4', 'FT3', 'TSH', 'Tg', 'Anti-Tg', 'Glucose', 'Protein'];

        indicators.forEach((indicator) => {
          // Tìm chỉ số trong text (case-insensitive)
          const searchTerm = indicator;
          const regex = new RegExp(searchTerm, 'i');
          const index = text.search(regex);

          if (index !== -1) {
            // Lấy 100 ký tự sau indicator để tìm giá trị
            const afterIndicator = text.substring(index, index + 100);
            console.log(`Searching for ${indicator} (term: ${searchTerm}), afterIndicator:`, afterIndicator);

            // Tìm số - có thể là:
            // - XX.XX hoặc XX,XX (số thập phân)
            // - XXX hoặc XXXX (số nguyên)
            // - XX.XXX hoặc XX,XXX (số có nhiều chữ số thập phân)
            const numberMatch = afterIndicator.match(/\b([0-9]{1,4}(?:[.,][0-9]{1,3})?)\b/);

            if (numberMatch) {
              data[indicator] = numberMatch[1];
              console.log(`${indicator} found: ${numberMatch[1]}`);
            } else {
              console.log(`${indicator} not found in: ${afterIndicator}`);
            }
          }
        });
        setExtractedData(data);
        console.log("Extracted data:", data);
      });
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Lỗi khi nhận diện text.");
    }
  };

  // Hàm lưu dữ liệu
  const handleSaveData = () => {
    const dataToSave: Record<string, string> = {};
    ['FT4', 'FT3', 'TSH', 'Tg', 'Anti-Tg', 'Glucose', 'Protein'].forEach((indicator) => {
      if (extractedData[indicator]) {
        dataToSave[indicator] = extractedData[indicator];
      }
    });
    setSavedData(dataToSave);
    alert("Đã lưu kết quả!");
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", borderRadius: 8 }}
      />

      <button
        onClick={handleCapture}
        className="mt-4 w-full rounded-xl py-3 bg-blue-600 text-white"
      >
        Chụp tài liệu
      </button>

      {/* raw canvas (ẩn) */}
      <canvas ref={rawCanvasRef} style={{ display: "none" }} />

      <h3 className="mt-4 text-lg font-semibold">Ảnh scan:</h3>

      {/* output canvas */}
      <canvas
        ref={outputCanvasRef}
        style={{
          width: "100%",
          border: "1px solid #ddd",
          borderRadius: 8,
          marginTop: 8,
        }}
      />

      {/* Hiển thị kết quả extracted */}
      {Object.keys(extractedData).length > 0 && (
        <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12 }}>Kết quả nhận diện:</h3>

          {/* Layout hai cột: Trái (kết quả hiện tại), Phải (kết quả đã lưu) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* Cột trái: Kết quả hiện tại */}
            <div style={{ backgroundColor: '#fff', padding: 12, borderRadius: 4 }}>
              <h4 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#1976d2' }}>Kết quả hiện tại:</h4>
              {['FT4', 'FT3', 'TSH', 'Tg', 'Anti-Tg', 'Glucose', 'Protein'].map((indicator) => (
                <div key={indicator} style={{ marginBottom: 6, fontSize: 12 }}>
                  {extractedData[indicator] ? (
                    <span style={{ color: '#2e7d32' }}>
                      <span style={{ fontWeight: 'bold' }}>{indicator}: </span>
                      <span>{extractedData[indicator]}</span>
                    </span>
                  ) : (
                    <span style={{ color: '#999' }}>
                      {indicator}: <em>-</em>
                    </span>
                  )}
                </div>
              ))}

              {/* Nút Lưu */}
              <button
                onClick={handleSaveData}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '8px 12px',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Lưu
              </button>
            </div>

            {/* Cột phải: Kết quả đã lưu */}
            <div style={{ backgroundColor: '#e8f5e9', padding: 12, borderRadius: 4 }}>
              <h4 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#2e7d32' }}>Kết quả đã lưu:</h4>
              {Object.keys(savedData).length > 0 ? (
                ['FT4', 'FT3', 'TSH', 'Tg', 'Anti-Tg', 'Glucose', 'Protein'].map((indicator) => (
                  <div key={indicator} style={{ marginBottom: 6, fontSize: 12 }}>
                    {savedData[indicator] ? (
                      <span style={{ color: '#2e7d32' }}>
                        <span style={{ fontWeight: 'bold' }}>{indicator}: </span>
                        <span>{savedData[indicator]}</span>
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>
                        {indicator}: <em>-</em>
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <span style={{ color: '#999', fontSize: 12 }}>Chưa có dữ liệu lưu</span>
              )}
            </div>
          </div>

          {/* Hiển thị toàn bộ raw text */}
          {extractedData['_raw_text'] && (
            <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff', borderRadius: 4, borderTop: '1px solid #ddd' }}>
              <h4 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>Toàn bộ text nhận diện được:</h4>
              <div style={{
                fontSize: 11,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 250,
                overflow: 'auto',
                padding: 8,
                backgroundColor: '#f9f9f9',
                border: '1px solid #ddd',
                lineHeight: '1.4'
              }}>
                {extractedData['_raw_text']}
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        className="flex justify-center items-center gap-1 mt-4"
        color="danger"
        onPress={() => {
          stopCamera();
          setTimeout(() => {
            navigate("/");
          }, 100);
        }}
      >
        <p className="font-bold text-inherit text-center">Back to home</p>
      </Button>
    </div>
  );
};

export default DocumentScanner;
