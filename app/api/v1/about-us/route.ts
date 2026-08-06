import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ClinicController::getAboutPageDetails (ClinicController.php:114-172). Note the
// story_1_*/story_2_* keys are fetched in Laravel's $keys list but never actually read when
// building the response (dead code there) - only the `stories` JSON blob feeds the `stories`
// array, so those keys are intentionally omitted here too.
/**
 * @swagger
 * /api/v1/about-us:
 *   get:
 *     summary: Get the public "About Us" page content (intro video, title, story block)
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: About page details fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "About page details fetched successfully." }
 *                 data:
 *                   type: object
 *                   description: About Us content assembled from the `compliances` key/value rows.
 *                   properties:
 *                     introduction_video_url: { type: string, nullable: true }
 *                     about_us_title: { type: string, nullable: true }
 *                     youtube_video: { type: string, nullable: true }
 *                     about_us: { type: string, nullable: true }
 *                     story_title: { type: string, nullable: true }
 *                     stories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           image: { type: string, nullable: true }
 *                           name: { type: string, nullable: true }
 *                           designation: { type: string, nullable: true }
 *                           description: { type: string, nullable: true }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.compliances.findMany({
      where: { key: { in: ["introduction_video", "about_us_title", "youtube_video", "about_us", "story_title", "stories"] } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const introVideoValue = byKey.get("introduction_video");
    const introductionVideoUrl = introVideoValue ? assetUrl(introVideoValue, "backend/about") : null;

    let stories: { image: string | null; name: string | null; designation: string | null; description: string | null }[] = [];
    const storiesValue = byKey.get("stories");
    if (storiesValue) {
      try {
        const decoded = JSON.parse(storiesValue);
        if (Array.isArray(decoded)) {
          stories = decoded.map((story: Record<string, unknown>) => ({
            image: story.image ? assetUrl(story.image, "backend/about") : null,
            name: (story.name as string) ?? null,
            designation: (story.designation as string) ?? null,
            description: (story.description as string) ?? null,
          }));
        }
      } catch {
        stories = [];
      }
    }

    return successResponse("About page details fetched successfully.", {
      data: {
        introduction_video_url: introductionVideoUrl,
        about_us_title: byKey.get("about_us_title") ?? null,
        youtube_video: byKey.get("youtube_video") ?? null,
        about_us: byKey.get("about_us") ?? null,
        story_title: byKey.get("story_title") ?? null,
        stories,
      },
    });
  } catch (error) {
    console.error("Exception while fetching about page details", error);
    return serverErrorResponse("Failed to get about page details.", error);
  }
}
