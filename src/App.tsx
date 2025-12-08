import { Route, Routes } from "react-router-dom";

import IndexPage from "@/pages/index";
import DocsPage from "@/pages/docs";
import ScanPage from "./pages/scan";

function App() {
  return (
    <Routes>
      <Route element={<IndexPage />} path="/" />
      <Route element={<DocsPage />} path="/docs" />
      <Route element={<ScanPage />} path="/scan" />
    </Routes>
  );
}

export default App;
