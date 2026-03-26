import { storage } from "./storage";

export async function seed() {
  const userCount = await storage.getUserStats();
  const channelsList = await storage.getChannels();
  const { total: movieCount } = await storage.getMovies({});

  // Seed Channels if empty
  if (channelsList.length === 0) {
    console.log("Seeding channels...");
    await storage.createChannel({
      telegramId: "-1001234567890",
      username: "MovieSourceChannel",
      role: "source",
      name: "Main Source",
      isActive: true
    });

    await storage.createChannel({
      telegramId: "-1009876543210",
      username: "MovieBackupChannel",
      role: "backup",
      name: "Backup 1",
      isActive: true
    });
  }

  // Seed Movies if empty or less than expected
  if (movieCount < 10) {
    console.log("Seeding movies...");
    // 2. Create Movies & Series (2023-2026)
    const moviesToSeed = [
      // 2026
      { title: "Pillion", type: "movie", releaseDate: "2026-03-15", quality: "1080p", genre: "Romance, Drama", overview: "Directorial debut by Harry Lighton, starring Alexander Skarsgård & Harry Melling." },
      { title: "Young Mothers", type: "movie", releaseDate: "2026-05-20", quality: "1080p", genre: "Drama", overview: "A humanistic character study on resilience." },
      { title: "Severance Season 2", type: "series", releaseDate: "2026-01-17", quality: "4k", genre: "Sci-Fi, Thriller", overview: "Continuation of the hit season where employees have their memories surgically divided." },
      { title: "3 Body Problem Season 2", type: "series", releaseDate: "2026-06-10", quality: "4k", genre: "Sci-Fi", overview: "From GoT creators Benioff & Weiss, based on the award-winning novel." },
      
      // 2025
      { title: "Anora", type: "movie", releaseDate: "2025-05-22", quality: "4k", genre: "Comedy, Drama", overview: "Palme d'Or winner at Cannes, directed by Sean Baker." },
      { title: "Nosferatu", type: "movie", releaseDate: "2025-01-01", quality: "4k", genre: "Horror", overview: "Robert Eggers' reimagining of the classic vampire tale." },
      { title: "The Brutalist", type: "movie", releaseDate: "2025-09-12", quality: "1080p", genre: "Drama", overview: "Starring Adrien Brody, Felicity Jones, Guy Pearce." },
      { title: "Stranger Things Finale", type: "series", releaseDate: "2025-07-04", quality: "4k", genre: "Sci-Fi, Horror", overview: "The epic conclusion to the Hawkins saga." },
      
      // 2024
      { title: "Civil War", type: "movie", releaseDate: "2024-04-12", quality: "1080p", genre: "Thriller, Action", overview: "Four journalists travel across the US during a rapid escalation of conflict." },
      { title: "Slow Horses Season 4", type: "series", releaseDate: "2024-09-04", quality: "1080p", genre: "Spy, Drama", overview: "The superb fourth season of the spy series starring Gary Oldman." },
      { title: "Dark Matter", type: "series", releaseDate: "2024-05-08", quality: "1080p", genre: "Sci-Fi, Thriller", overview: "A man is kidnapped into an alternate version of his life." },
      
      // 2023
      { title: "The Last of Us", type: "series", releaseDate: "2023-01-15", quality: "4k", genre: "Action, Drama", overview: "After a global pandemic destroys civilization, a survivor takes charge of a 14-year-old girl." },
      { title: "Beef", type: "series", releaseDate: "2023-04-06", quality: "1080p", genre: "Comedy, Drama", overview: "Two people let a road rage incident burrow into their minds." },
      { title: "Oppenheimer", type: "movie", releaseDate: "2023-07-21", quality: "4k", genre: "History, Drama", overview: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb." }
    ];

    for (const movie of moviesToSeed) {
      await storage.createMovie({
        fileId: "placeholder_file_id",
        fileUniqueId: "unique_" + Math.random().toString(36).substring(7),
        title: movie.title,
        caption: `${movie.title} (${movie.releaseDate.split('-')[0]}) - ${movie.quality}`,
        fileSize: 1000000000,
        duration: 7200,
        quality: movie.quality as any,
        type: movie.type as any,
        releaseDate: movie.releaseDate,
        genre: movie.genre,
        overview: movie.overview
      });
    }
  }

  // Seed Ads if empty
  const adsList = await storage.getAds();
  if (adsList.length === 0) {
    console.log("Seeding ads...");
    await storage.createAd({
      type: "adsterra",
      title: "Main Banner Ad",
      content: "<script type='text/javascript' src='//pl12345.adsterra.com/...'></script>",
      isActive: true,
      weight: 5
    });

    await storage.createAd({
      type: "custom_banner",
      title: "Crypto Promo",
      content: "<div style='background:gold;padding:20px'>Buy Crypto Now!</div>",
      isActive: true,
      weight: 2
    });
  }

  console.log("Database seeded!");
}
