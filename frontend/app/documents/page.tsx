import { SavedDocuments } from "@/components/saved-documents";

export const metadata = { title: "My documents | Prelegal" };

/**
 * The saved documents list.
 *
 * A static page that fetches on the client: the export has no server at request
 * time, and one person's documents could not be prerendered in any case.
 */
export default function DocumentsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <SavedDocuments />
    </main>
  );
}
