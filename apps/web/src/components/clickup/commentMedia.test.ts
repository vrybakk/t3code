import { describe, expect, it } from "vite-plus/test";
import { commentLinkedMedia } from "./commentMedia";

const desktop =
  "https://t2179724.p.clickup-attachments.com/t2179724/e757facb/country-filter-flags-desktop.png";
const phone =
  "https://t2179724.p.clickup-attachments.com/t2179724/903215cd/country-filter-flags-phone.png";

describe("commentLinkedMedia", () => {
  it("finds pasted image and video URLs and ignores other links", () => {
    const text = `Screenshots:\nDesktop: ${desktop}\nPhone: (${phone}).\nDemo https://cdn.test/a%20demo.mp4\nPR: https://github.com/acme/app/pull/122`;
    expect(commentLinkedMedia(text)).toEqual([
      { name: "country-filter-flags-desktop.png", url: desktop },
      { name: "country-filter-flags-phone.png", url: phone },
      { name: "a demo.mp4", url: "https://cdn.test/a%20demo.mp4" },
    ]);
  });

  it("skips repeats and URLs already attached to the comment", () => {
    expect(
      commentLinkedMedia(`${desktop} ${desktop} ${phone}`, [{ name: "Desktop", url: desktop }]),
    ).toEqual([{ name: "country-filter-flags-phone.png", url: phone }]);
  });

  it("does not load insecure URLs", () => {
    expect(commentLinkedMedia("http://cdn.test/image.png")).toEqual([]);
  });
});
