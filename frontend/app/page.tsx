import { DocumentCreator } from "@/components/document-creator";
import { loadDocuments } from "@/lib/templates";

/**
 * Reads every agreement template from `templates/` on the server, parses them
 * once, and hands the result to the client for live editing. Nothing about the
 * agreements is fetched at runtime, so the page prerenders to static HTML and
 * switching between documents costs no network at all.
 */
export default async function Page() {
  return <DocumentCreator documents={await loadDocuments()} />;
}
