import { ChatWindow } from "@/components/ChatWindow";

type HomeProps = {
  searchParams: Promise<{
    review?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const reviewMode = params.review === "1";

  return (
    <main className="app-shell">
      <ChatWindow reviewMode={reviewMode} />
    </main>
  );
}
