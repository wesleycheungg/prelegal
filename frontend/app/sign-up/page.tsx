import { CredentialsForm } from "@/components/credentials-form";

export const metadata = { title: "Create your account | Prelegal" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <CredentialsForm mode="sign-up" />
    </main>
  );
}
