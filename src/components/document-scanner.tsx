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
    const cv = (window as any).cv;

    if (!tesseract) {
      alert("Tesseract chưa được tải. Vui lòng thử lại.");
      return;
    }

    try {
      console.log("Starting OCR...");

      // Cải thiện ảnh trước khi OCR
      let processedCanvas = canvas;

      if (cv) {
        // Chuyển canvas thành Mat
        let src = cv.imread(canvas);
        let gray = cv.Mat.zeros(src.rows, src.cols, cv.CV_8U);

        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Tăng contrast (CLAHE - Contrast Limited Adaptive Histogram Equalization)
        let clahe = cv.createCLAHE(2.0, new cv.Size(8, 8));
        let enhanced = new cv.Mat();
        clahe.apply(gray, enhanced);

        // Threshold để làm text rõ hơn
        let binary = new cv.Mat();
        cv.threshold(enhanced, binary, 150, 255, cv.THRESH_BINARY);

        // Vẽ lên canvas
        processedCanvas = document.createElement('canvas');
        processedCanvas.width = canvas.width;
        processedCanvas.height = canvas.height;
        cv.imshow(processedCanvas, binary);

        // Cleanup
        src.delete();
        gray.delete();
        enhanced.delete();
        binary.delete();

        console.log("Image preprocessing done");
      }

      // Chuyển canvas thành blob
      processedCanvas.toBlob(async (blob) => {
        if (!blob) return;

        const { data: { text } } = await tesseract.recognize(blob, "vie+eng");
        console.log("OCR Raw Text:", text);

        // Parse text để tìm FT4 và giá trị của nó
        const data: Record<string, string> = {};

        // Cách 1: Tìm FT4 và số tiếp theo (có thể cách nhau)
        const ft4Match = text.match(/FT4[^\d]*([0-9]{1,2}[.,][0-9]{1,2})/i);
        if (ft4Match) {
          data['FT4'] = ft4Match[1];
          console.log("FT4 found (method 1):", ft4Match[1]);
        } else {
          // Cách 2: Tìm "FT4" rồi lấy số đầu tiên sau đó
          const ft4Index = text.toUpperCase().indexOf('FT4');
          if (ft4Index !== -1) {
            const afterFT4 = text.substring(ft4Index + 3, ft4Index + 30);
            const numMatch = afterFT4.match(/([0-9]{1,2}[.,][0-9]{1,2})/);
            if (numMatch) {
              data['FT4'] = numMatch[1];
              console.log("FT4 found (method 2):", numMatch[1]);
            }
          }
        }

        // Tìm các chỉ số khác (TSH, T3, T4, etc.)
        const testPatterns = [
          { name: 'TSH', regex: /TSH[^\d]*([0-9]{0,2}[.,][0-9]{1,3})/i },
          { name: 'T3', regex: /T3[^\d]*([0-9]{1,3}[.,][0-9]{1,2})/i },
          { name: 'T4', regex: /T4[^\d]*([0-9]{1,2}[.,][0-9]{1,2})/i },
          { name: 'TPO', regex: /TPO[^\d]*([0-9]{1,3}[.,][0-9]{1,2})/i },
        ];

        for (const pattern of testPatterns) {
          const match = text.match(pattern.regex);
          if (match && !data[pattern.name]) {
            data[pattern.name] = match[1];
            console.log(`${pattern.name} found:`, match[1]);
          }
        }

        // Lưu raw OCR text để hiển thị
        data['_raw_text'] = text;

        setExtractedData(data);
        console.log("Extracted data:", data);
        console.log("Raw OCR text:", text);

        alert("OCR hoàn tất. Xem kết quả bên dưới.");
      });
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Lỗi khi nhận diện text.");
    }
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
          <h3 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>Kết quả nhận diện:</h3>

          {/* Hiển thị các chỉ số đã extract */}
          {Object.entries(extractedData)
            .filter(([key]) => key !== '_raw_text')
            .map(([key, value]) => (
              <div key={key} style={{ marginBottom: 8, padding: 8, backgroundColor: '#fff', borderRadius: 4, borderLeft: '3px solid #0066cc' }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>{key}:</span>
                <span style={{ marginLeft: 8, fontSize: 14 }}>{value}</span>
              </div>
            ))}

          {/* Hiển thị raw text nếu có */}
          {extractedData['_raw_text'] && (
            <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff', borderRadius: 4, borderTop: '1px solid #ddd' }}>
              <h4 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>Raw OCR Text:</h4>
              <div style={{
                fontSize: 11,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 200,
                overflow: 'auto',
                padding: 6,
                backgroundColor: '#f9f9f9',
                border: '1px solid #ddd'
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
