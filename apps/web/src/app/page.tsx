export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">
          Feed<span className="text-orange-500">Glow</span> 🌟
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
          Lightweight AI-powered RSS reader
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/feeds"
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Get Started
          </a>
          <a
            href="https://github.com/user/feedglow"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
