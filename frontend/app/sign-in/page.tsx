import { CredentialsForm } from "@/components/credentials-form";

export const metadata = { title: "Sign in | Prelegal" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <CredentialsForm mode="sign-in" />
    </main>
  );
}
