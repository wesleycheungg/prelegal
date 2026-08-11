import { MndaCreator } from "@/components/mnda-creator";
import { parseCoverPageTemplate } from "@/lib/cover-page-template";
import { prepareStandardTerms } from "@/lib/standard-terms";
import { TEMPLATE_FILE, readTemplate } from "@/lib/templates";

/**
 * Reads the Mutual NDA templates from `templates/` on the server, parses them
 * once, and hands the result to the client for live editing. Nothing about the
 * agreement is fetched at runtime, so the page prerenders to static HTML.
 */
export default async function Page() {
  const [coverPage, standardTerms] = await Promise.all([
    readTemplate(TEMPLATE_FILE.mutualNdaCoverPage),
    readTemplate(TEMPLATE_FILE.mutualNda),
  ]);

  return (
    <MndaCreator
      template={parseCoverPageTemplate(coverPage)}
      standardTerms={prepareStandardTerms(standardTerms)}
    />
  );
}
