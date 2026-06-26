export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-4xl font-bold">
          Fortress Finance Dashboard
        </h1>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Account Balance</h2>
            <p className="mt-4 text-3xl font-bold">$0.00</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Wallet Balance</h2>
            <p className="mt-4 text-3xl font-bold">$0.00</p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold">Transactions</h2>
            <p className="mt-4 text-3xl font-bold">0</p>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-2xl font-semibold">
            Recent Activity
          </h2>

          <p className="text-gray-500">
            No transactions available.
          </p>
        </div>
      </div>
    </main>
  );
}
