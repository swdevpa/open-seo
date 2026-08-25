import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { startYoutubeLink as startYoutubeAuthorization } from "@/serverFunctions/youtube";

export async function startYoutubeLink(
  projectId: string,
  callbackURL: string,
): Promise<void> {
  try {
    const response = await startYoutubeAuthorization({
      data: { projectId, callbackURL },
    });
    window.location.href = response.url;
  } catch (error) {
    toast.error(
      getStandardErrorMessage(error, "Could not connect the YouTube channel."),
    );
  }
}
