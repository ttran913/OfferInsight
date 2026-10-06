import { NextRequest, NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { prisma } from "@/db";
import { loadSchedulingRoster } from "@/app/lib/calendar/scheduling-instructor";

/** Escape a CSV cell: wrap in quotes and escape internal quotes */
function csvEscape(value: string): string {
  const s = String(value ?? "").trim();
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Extract GitHub repo/project name from a URL.
 * e.g. https://github.com/owner/Jobs4Us/pull/888 -> "owner/Jobs4Us"
 * Also handles www.github.com and other variations.
 * Matches /pull/ or /issues/ paths, or just owner/repo URLs.
 */
function projectNameFromGitHubUrl(url: string): string | null {
  const s = String(url ?? "").trim();
  if (!s || (!s.startsWith("http://") && !s.startsWith("https://"))) return null;
  try {
    const u = new URL(s);
    let host = u.hostname.toLowerCase();
    // Handle www.github.com and github.com
    if (host.startsWith("www.")) {
      host = host.substring(4);
    }
    if (host !== "github.com") return null;
    
    const path = u.pathname.replace(/^\/+/, "").split("/").filter(p => p.length > 0);
    
    // Case 1: URL has /pull/ or /issues/ (e.g., owner/repo/pull/123)
    if (path.length >= 4 && (path[2] === "pull" || path[2] === "issues")) {
      const owner = path[0];
      const repo = path[1];
      if (owner && repo) {
        return `${owner}/${repo}`;
      }
      return null;
    }
    
    // Case 2: URL is just owner/repo (e.g., owner/repo)
    if (path.length >= 2) {
      const owner = path[0];
      const repo = path[1];
      // Skip if it looks like a special path (e.g., "settings", "issues", etc.)
      const skipPaths = ["settings", "security", "insights", "pulse", "graphs", "network"];
      if (owner && repo && !skipPaths.includes(repo.toLowerCase())) {
        return `${owner}/${repo}`;
      }
    }
  } catch (error) {
    // Log error for debugging but don't throw
    console.error("Error parsing GitHub URL:", url, error);
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim().toLowerCase();
    const minIssuesParam = searchParams.get("minIssues") ?? "";
    const minIssues = minIssuesParam === "" ? null : Math.max(0, parseInt(minIssuesParam, 10));
    const minIssuesValid = minIssues === null || !Number.isNaN(minIssues);

    const mineOnly = searchParams.get("mine") === "1";

    const [allUsers, roster] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          expectedGraduationDate: true,
          assignedInstructorId: true,
          monthlyMeeting: { select: { instructorId: true } },
        },
        orderBy: { name: "asc" },
      }),
      mineOnly ? loadSchedulingRoster() : null,
    ]);
    const users = roster
      ? allUsers.filter(
          (u) =>
            roster.effectiveInstructorId(u.assignedInstructorId, u.monthlyMeeting?.instructorId ?? null) ===
            instructor.id
        )
      : allUsers;

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      const csv = "Name,Email,Created At,Graduation Date,Issues Solved,Projects,PR Links,Blog Posts,Criteria & Proof\n";
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="students-export.csv"',
        },
      });
    }

    const entries = await prisma.openSourceEntry.findMany({
      where: { userId: { in: userIds } },
      orderBy: [{ userId: "asc" }, { dateCreated: "desc" }],
    });

    const entriesByUser = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = entriesByUser.get(e.userId) ?? [];
      list.push(e);
      entriesByUser.set(e.userId, list);
    }

    const filteredUsers = users.filter((user) => {
      if (search && !(user.name ?? "").toLowerCase().includes(search)) return false;
      const userEntries = entriesByUser.get(user.id) ?? [];
      const issuesCompleted = userEntries.filter(
        (e) => e.criteriaType === "issue" && e.status === "done"
      ).length;
      if (minIssuesValid && minIssues !== null && issuesCompleted < minIssues) return false;
      return true;
    });

    const header =
      "Name,Email,Created At,Graduation Date,Issues Solved,Projects,PR Links,Blog Posts,Criteria & Proof\n";

    const rows: string[] = [];

    for (const user of filteredUsers) {
      const userEntries = entriesByUser.get(user.id) ?? [];
      const doneEntries = userEntries.filter((e) => e.status === "done");

      const issuesCompleted = userEntries.filter(
        (e) => e.criteriaType === "issue" && e.status === "done"
      ).length;

      const prLinks: string[] = [];
      const blogPosts: string[] = [];
      const projectsSet = new Set<string>();
      const criteriaProofParts: string[] = [];

      for (const entry of doneEntries) {
        const proofResponses = (entry.proofResponses as Record<string, unknown>) ?? {};
        const proofPairs = Object.entries(proofResponses)
          .filter(([, v]) => v != null && String(v).trim() !== "")
          .map(([k, v]) => `${k.trim()}: ${String(v).trim()}`);

        if (entry.criteriaType === "issue") {
          for (const v of Object.values(proofResponses)) {
            const s = String(v ?? "").trim();
            if (s && (s.startsWith("http://") || s.startsWith("https://"))) {
              prLinks.push(s);
              const project = projectNameFromGitHubUrl(s);
              if (project) {
                projectsSet.add(project);
              }
            }
          }
        }
        if (entry.criteriaType === "blog_post") {
          for (const v of Object.values(proofResponses)) {
            const s = String(v ?? "").trim();
            if (s && (s.startsWith("http://") || s.startsWith("https://"))) {
              blogPosts.push(s);
            }
          }
        }

        const metricLabel = (entry.metric ?? entry.criteriaType ?? "entry").slice(0, 60);
        if (proofPairs.length > 0) {
          criteriaProofParts.push(`${entry.criteriaType ?? "?"} (${metricLabel}): ${proofPairs.join("; ")}`);
        } else {
          criteriaProofParts.push(`${entry.criteriaType ?? "?"} (${metricLabel})`);
        }
      }

      const name = csvEscape(user.name ?? "");
      const email = csvEscape(user.email ?? "");
      const createdAt = csvEscape(user.createdAt.toISOString().split("T")[0]);
      const graduationDate = user.expectedGraduationDate
        ? csvEscape(user.expectedGraduationDate.toISOString().split('T')[0]) // Format as YYYY-MM-DD
        : csvEscape("");
      const prLinksCell = csvEscape(prLinks.join("; "));
      const blogPostsCell = csvEscape(blogPosts.join("; "));
      const projectsCell = csvEscape(Array.from(projectsSet).join("; "));
      const criteriaProofCell = csvEscape(criteriaProofParts.join(" | "));

      rows.push(
        `${name},${email},${createdAt},${graduationDate},${issuesCompleted},${projectsCell},${prLinksCell},${blogPostsCell},${criteriaProofCell}`
      );
    }

    const csv = header + rows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="students-export.csv"',
      },
    });
  } catch (error) {
    console.error("Error exporting students CSV:", error);
    return NextResponse.json(
      { error: "Failed to export CSV" },
      { status: 500 }
    );
  }
}
