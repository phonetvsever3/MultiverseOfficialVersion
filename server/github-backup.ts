import { storage } from "./storage";
import fs from "fs";
import path from "path";

export interface GitHubBackupConfig {
  token: string;
  repo: string; // format: "owner/repo"
  branch: string;
}

const PROJECT_ROOT = process.cwd();

// Directories and files to include in the backup
const INCLUDE_DIRS = ["server", "client", "shared"];
const INCLUDE_ROOT_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "tailwind.config.ts",
  "postcss.config.js",
  "drizzle.config.ts",
  "replit.md",
  ".replit",
];

// File extensions to skip (binaries, etc.)
const SKIP_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".map", ".lock"
];

function shouldSkipFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SKIP_EXTENSIONS.includes(ext);
}

function getAllFiles(dir: string, baseDir: string = ""): Array<{ relativePath: string; fullPath: string }> {
  const results: Array<{ relativePath: string; fullPath: string }> = [];
  
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = baseDir ? `${baseDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Skip node_modules, dist, .git, .cache, .local
      if (["node_modules", "dist", ".git", ".cache", ".local", "attached_assets"].includes(entry.name)) {
        continue;
      }
      results.push(...getAllFiles(fullPath, relativePath));
    } else if (entry.isFile()) {
      if (!shouldSkipFile(entry.name)) {
        results.push({ relativePath, fullPath });
      }
    }
  }

  return results;
}

async function githubRequest(
  config: GitHubBackupConfig,
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const [owner, repo] = config.repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${config.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error [${method} ${endpoint}]: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function createBlob(config: GitHubBackupConfig, content: string): Promise<string> {
  const data = await githubRequest(config, "/git/blobs", "POST", {
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  }) as any;
  return data.sha;
}

async function getLatestCommitSha(config: GitHubBackupConfig): Promise<{ commitSha: string; treeSha: string } | null> {
  try {
    const branchData = await githubRequest(config, `/git/refs/heads/${config.branch}`) as any;
    const commitSha = branchData.object.sha;
    const commitData = await githubRequest(config, `/git/commits/${commitSha}`) as any;
    return { commitSha, treeSha: commitData.tree.sha };
  } catch {
    return null;
  }
}

export async function performBackup(
  config: GitHubBackupConfig,
  backupType: "manual" | "auto" = "manual"
) {
  try {
    console.log(`[Backup] Starting ${backupType} source code backup to GitHub...`);

    // Collect all source files
    const allFiles: Array<{ relativePath: string; fullPath: string }> = [];

    // Add root config files
    for (const fileName of INCLUDE_ROOT_FILES) {
      const fullPath = path.join(PROJECT_ROOT, fileName);
      if (fs.existsSync(fullPath)) {
        allFiles.push({ relativePath: fileName, fullPath });
      }
    }

    // Add all files from source directories
    for (const dir of INCLUDE_DIRS) {
      const dirPath = path.join(PROJECT_ROOT, dir);
      if (fs.existsSync(dirPath)) {
        const dirFiles = getAllFiles(dirPath, dir);
        allFiles.push(...dirFiles);
      }
    }

    console.log(`[Backup] Found ${allFiles.length} files to backup`);

    // Get current branch state
    const branchState = await getLatestCommitSha(config);

    // Create blobs for each file and build tree
    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];

    let uploadedCount = 0;
    for (const file of allFiles) {
      let content: string;
      try {
        content = fs.readFileSync(file.fullPath, "utf-8");
      } catch {
        // Skip files that can't be read as text
        continue;
      }

      const blobSha = await createBlob(config, content);
      treeItems.push({
        path: file.relativePath,
        mode: "100644",
        type: "blob",
        sha: blobSha,
      });
      uploadedCount++;

      if (uploadedCount % 10 === 0) {
        console.log(`[Backup] Uploaded ${uploadedCount}/${allFiles.length} files...`);
      }
    }

    // Create a new Git tree
    const timestamp = new Date().toISOString();
    const treeData = await githubRequest(config, "/git/trees", "POST", {
      tree: treeItems,
      ...(branchState && { base_tree: branchState.treeSha }),
    }) as any;

    // Create a commit
    const commitMessage = `[${backupType === "manual" ? "Manual" : "Auto"}] Source code backup - ${timestamp}`;
    const commitBody: any = {
      message: commitMessage,
      tree: treeData.sha,
    };
    if (branchState) {
      commitBody.parents = [branchState.commitSha];
    }

    const commitData = await githubRequest(config, "/git/commits", "POST", commitBody) as any;

    // Update the branch reference (force update)
    try {
      await githubRequest(config, `/git/refs/heads/${config.branch}`, "PATCH", {
        sha: commitData.sha,
        force: true,
      });
    } catch {
      // If branch doesn't exist yet, create it
      await githubRequest(config, "/git/refs", "POST", {
        ref: `refs/heads/${config.branch}`,
        sha: commitData.sha,
      });
    }

    console.log(`[Backup] Successfully backed up ${uploadedCount} files to GitHub`);

    await storage.createBackup({
      type: backupType,
      status: "success",
      message: `${uploadedCount} source files backed up to ${config.repo}:${config.branch}`,
    });

    return {
      success: true,
      message: `Successfully backed up ${uploadedCount} source code files to GitHub`,
    };
  } catch (error: any) {
    console.error("[Backup] Error:", error.message);

    await storage.createBackup({
      type: backupType,
      status: "failed",
      message: error.message,
    });

    throw error;
  }
}
