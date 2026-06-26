import { APP_NAME } from "@fortress/config";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-blue-600">
          Welcome to {APP_NAME}
        </h1>

        <p className="mt-4 text-lg text-gray-600">
          Fortress Finance Monorepo is working successfully.
        </p>
      </div>
    </main>
  );
}
