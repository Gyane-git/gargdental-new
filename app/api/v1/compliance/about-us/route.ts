import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { fetchComplianceRowByKey, parseComplianceValue, upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

const ABOUT_US_KEY = "about_us";
const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/about-us");

interface AboutUsStory {
  title?: string;
  name?: string;
  designation?: string;
  imageUrl?: string;
  description?: string;
}

interface AboutUsValue {
  title?: string;
  youtubeLink?: string;
  introVideoUrl?: string;
  aboutUsContent?: string;
  story?: AboutUsStory;
}

function buildResponseData(value: AboutUsValue) {
  const story = value?.story || {};
  const title = value?.title || "About Garg Dental";
  const youtubeLink = value?.youtubeLink || "";
  const introVideoUrl = value?.introVideoUrl || "";
  const aboutUsContent = value?.aboutUsContent || "";

  const storyTitle = story?.title || "Our Story";
  const storyName = story?.name || "";
  const storyDesignation = story?.designation || "";
  const storyImageUrl = story?.imageUrl || "";
  const storyDescription = story?.description || "";

  return {
    title,
    youtubeLink,
    introVideoUrl,
    aboutUsContent,
    story: { title: storyTitle, name: storyName, designation: storyDesignation, imageUrl: storyImageUrl, description: storyDescription },
    about_us_title: title,
    about_us: aboutUsContent,
    youtube_video: youtubeLink,
    introduction_video_url: introVideoUrl,
    story_title: storyTitle,
    stories: [{ name: storyName, designation: storyDesignation, image: storyImageUrl, description: storyDescription }],
  };
}

async function removeUploadedFile(fileUrl: string) {
  if (!fileUrl) return;
  const relativePath = String(fileUrl).replace(/^\/+/, "");
  try {
    await fs.unlink(path.join(process.cwd(), "public", relativePath));
  } catch {
    // Ignore missing files during cleanup.
  }
}

// Ports gargnew's app/api/v1/compliance/about-us/route.js. Admin-only, gated on POST/DELETE.
/**
 * @swagger
 * /api/v1/compliance/about-us:
 *   get:
 *     summary: Get the admin-editable "About Us" content record
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: About Us content fetched (`data` is null if no row exists yet).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   description: Includes both the raw fields and legacy about_us_title/about_us/youtube_video/introduction_video_url/story_title/stories aliases.
 *                   properties:
 *                     title: { type: string }
 *                     youtubeLink: { type: string }
 *                     introVideoUrl: { type: string }
 *                     aboutUsContent: { type: string }
 *                     story:
 *                       type: object
 *                       properties:
 *                         title: { type: string }
 *                         name: { type: string }
 *                         designation: { type: string }
 *                         imageUrl: { type: string }
 *                         description: { type: string }
 */
export async function GET() {
  const row = await fetchComplianceRowByKey(ABOUT_US_KEY);
  if (!row) return NextResponse.json({ success: true, data: null });

  const parsed = parseComplianceValue(row.value) as AboutUsValue | null;
  return NextResponse.json({ success: true, data: parsed ? buildResponseData(parsed) : null });
}

/**
 * @swagger
 * /api/v1/compliance/about-us:
 *   post:
 *     summary: Create or update the "About Us" content, optionally replacing the intro video and/or story image (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               youtubeLink: { type: string }
 *               aboutUsContent: { type: string }
 *               storyTitle: { type: string }
 *               storyName: { type: string }
 *               storyDesignation: { type: string }
 *               storyDescription: { type: string }
 *               introVideo: { type: string, format: binary, description: "Optional. Replaces the stored intro video when a non-empty file is sent." }
 *               storyImage: { type: string, format: binary, description: "Optional. Replaces the stored story image when a non-empty file is sent." }
 *     responses:
 *       200:
 *         description: About Us content saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "About Us saved successfully." }
 *                 data: { type: object, description: "Same shape as the GET data object." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, description: "Exception message, or a generic fallback." }
 */
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await req.formData();

    const title = formData.get("title") as string | null;
    const youtubeLink = formData.get("youtubeLink") as string | null;
    const aboutUsContent = formData.get("aboutUsContent") as string | null;
    const storyTitle = formData.get("storyTitle") as string | null;
    const storyName = formData.get("storyName") as string | null;
    const storyDesignation = formData.get("storyDesignation") as string | null;
    const storyDescription = formData.get("storyDescription") as string | null;
    const introVideo = formData.get("introVideo");
    const storyImage = formData.get("storyImage");

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const existingRow = await fetchComplianceRowByKey(ABOUT_US_KEY);
    const existingData = existingRow ? (parseComplianceValue(existingRow.value) as AboutUsValue | null) : null;

    let introVideoUrl = existingData?.introVideoUrl || "";
    let storyImageUrl = existingData?.story?.imageUrl || "";

    if (introVideo instanceof File && introVideo.size > 0) {
      const fileName = `${randomUUID()}${path.extname(introVideo.name)}`;
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await introVideo.arrayBuffer()));
      introVideoUrl = `/uploads/about-us/${fileName}`;
    }

    if (storyImage instanceof File && storyImage.size > 0) {
      const fileName = `${randomUUID()}${path.extname(storyImage.name)}`;
      await fs.writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await storyImage.arrayBuffer()));
      storyImageUrl = `/uploads/about-us/${fileName}`;
    }

    const value: AboutUsValue = {
      title: title || undefined,
      youtubeLink: youtubeLink || undefined,
      introVideoUrl,
      aboutUsContent: aboutUsContent || undefined,
      story: {
        title: storyTitle || undefined,
        name: storyName || undefined,
        designation: storyDesignation || undefined,
        imageUrl: storyImageUrl,
        description: storyDescription || undefined,
      },
    };

    await upsertCompliance(ABOUT_US_KEY, value);

    return NextResponse.json({ success: true, message: "About Us saved successfully.", data: buildResponseData(value) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/compliance/about-us:
 *   delete:
 *     summary: Delete the "About Us" content record, plus its uploaded intro video/story image files (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: About Us content deleted successfully (also returned when no row existed).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "About Us content deleted successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, description: "Exception message, or a generic fallback." }
 */
export async function DELETE(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const row = await fetchComplianceRowByKey(ABOUT_US_KEY);
    if (!row) {
      return NextResponse.json({ success: true, message: "About Us content deleted successfully." });
    }

    const parsed = parseComplianceValue(row.value) as AboutUsValue | null;
    const introVideoUrl = parsed?.introVideoUrl || "";
    const storyImageUrl = parsed?.story?.imageUrl || "";

    await prisma.compliances.delete({ where: { id: row.id } });

    await removeUploadedFile(introVideoUrl);
    await removeUploadedFile(storyImageUrl);

    return NextResponse.json({ success: true, message: "About Us content deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
