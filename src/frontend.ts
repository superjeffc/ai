// @ts-ignore
import htmlContent from "../dist/index.html";
// @ts-ignore
import jsContent from "../dist/app.js";

export function getHTMLFrontend(): string {
  return htmlContent;
}

export function getJSFrontend(): string {
  return jsContent;
}