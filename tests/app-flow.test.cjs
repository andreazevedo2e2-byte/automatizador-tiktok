const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const request = require("supertest");
const { createApp } = require("../server/app.cjs");

async function makeImage(color) {
  return sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: color,
    },
  })
    .jpeg()
    .toBuffer();
}

describe("app flow", () => {
  let rootDir;
  let app;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-app-"));
    const slides = [await makeImage("#3366ff"), await makeImage("#ff6633")];

    app = createApp({
      rootDir,
      services: {
        captureSlidesViaSnapTik: async (_url, slidesDir) => {
          await fs.mkdir(slidesDir, { recursive: true });
          const paths = [];
          for (const [index, image] of slides.entries()) {
            const slidePath = path.join(slidesDir, `slide-${String(index + 1).padStart(2, "0")}.jpg`);
            await fs.writeFile(slidePath, image);
            paths.push(slidePath);
          }
          return paths;
        },
        captureSlidesDirectly: async () => {
          throw new Error("Direct fallback should not be used in this test.");
        },
        runOcr: async (_paths, runId) => [
          {
            index: 1,
            sourceImagePath: path.join(rootDir, "runs", runId, "slides", "slide-01.jpg"),
            sourceImageUrl: `/runs/${runId}/slides/slide-01.jpg`,
            ocrEnglish: "5 tips to actually change your body",
            reviewedEnglish: "5 tips to actually change your body",
            confidence: 92,
            status: "ocr-complete",
            replacementImagePath: "",
            replacementImageUrl: "",
            renderedImagePath: "",
            renderedImageUrl: "",
          },
          {
            index: 2,
            sourceImagePath: path.join(rootDir, "runs", runId, "slides", "slide-02.jpg"),
            sourceImageUrl: `/runs/${runId}/slides/slide-02.jpg`,
            ocrEnglish: "Build habits that last",
            reviewedEnglish: "Build habits that last",
            confidence: 88,
            status: "ocr-complete",
            replacementImagePath: "",
            replacementImageUrl: "",
            renderedImagePath: "",
            renderedImageUrl: "",
          },
        ],
        extractCaptionAndHashtags: async () => ({
          caption: "This changed my routine",
          hashtags: ["#fitness", "#habits"],
        }),
        translateTexts: async ({ texts, from, to }) => texts.map((text) => `[${from}->${to}] ${text}`),
      },
    });
  });

  it("extracts, saves review, renders and persists Drive delivery metadata", async () => {
    const extract = await request(app)
      .post("/api/extract")
      .send({ url: "https://www.tiktok.com/@foo/photo/1234567890123456789" })
      .expect(200);

    expect(extract.body.stage).toBe("review");
    expect(extract.body.captionEnglish).toBe("This changed my routine");
    expect(extract.body.hashtags).toEqual(["#fitness", "#habits"]);
    expect(extract.body.slides[0].ocrPortuguese).toContain("[en->pt]");

    const runId = extract.body.runId;

    const review = await request(app)
      .put(`/api/runs/${runId}/review`)
      .send({
        captionEnglish: "Updated caption #fitness #daily",
        captionPortuguese: "Legenda atualizada",
        hashtags: ["#fitness", "#daily"],
        slides: extract.body.slides.map((slide, index) => ({
          index: slide.index,
          reviewedEnglish: `${slide.reviewedEnglish} (${index + 1})`,
          reviewedPortuguese: `PT ${index + 1}`,
        })),
      })
      .expect(200);

    expect(review.body.stage).toBe("images");

    const upload = await request(app)
      .post(`/api/runs/${runId}/replacements`)
      .attach("images", await makeImage("#221144"), "a.jpg")
      .attach("images", await makeImage("#114422"), "b.jpg")
      .expect(200);

    expect(upload.body.stage).toBe("render");

    const render = await request(app).post(`/api/runs/${runId}/render`).expect(200);
    expect(render.body.stage).toBe("preview");
    expect(render.body.slides[0].renderedImageUrl).toContain("/rendered/");
    expect(render.body.slides[0].textLayers?.length).toBeGreaterThan(0);

    const driveTarget = await request(app)
      .put(`/api/runs/${runId}/drive-target`)
      .send({
        folderId: "perfil-2-id",
        folderName: "perfil 2",
      })
      .expect(200);

    expect(driveTarget.body.stage).toBe("publish");
    expect(driveTarget.body.driveTarget).toMatchObject({
      folderId: "perfil-2-id",
      folderName: "perfil 2",
    });

    const driveExport = await request(app)
      .put(`/api/runs/${runId}/drive-export`)
      .send({
        profileFolderId: "perfil-2-id",
        profileFolderName: "perfil 2",
        postFolderId: "post-folder-id",
        postFolderName: "post 1",
        postFolderUrl: "https://drive.google.com/drive/folders/post-folder-id",
        files: [
          { id: "file-1", name: "slide-01.jpg", mimeType: "image/jpeg", webViewLink: "https://drive.google.com/file/d/file-1/view" },
          { id: "file-2", name: "caption.txt", mimeType: "text/plain", webViewLink: "https://drive.google.com/file/d/file-2/view" },
        ],
      })
      .expect(200);

    expect(driveExport.body.driveExport).toMatchObject({
      profileFolderId: "perfil-2-id",
      postFolderId: "post-folder-id",
      postFolderName: "post 1",
    });
    expect(driveExport.body.driveExport.files).toHaveLength(2);

    const reopened = await request(app).get(`/api/runs/${runId}`).expect(200);
    expect(reopened.body.driveTarget.folderName).toBe("perfil 2");
    expect(reopened.body.driveExport.postFolderName).toBe("post 1");

    const projects = await request(app).get("/api/projects").expect(200);
    expect(projects.body.items[0]).toMatchObject({
      runId,
      slideCount: 2,
      stage: "publish",
    });

    await request(app).delete(`/api/runs/${runId}`).expect(200);
    await request(app).get(`/api/runs/${runId}`).expect(404);
  });
});
