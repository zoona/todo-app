import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 /todo-app/ 아래에 올라간다.
export default defineConfig({
  base: "/todo-app/",
  plugins: [react()],
});
