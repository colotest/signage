import { canSeeGroup, canSeeScreen } from "@/lib/auth/access";
import { pageViewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUploaderNames } from "@/lib/uploads/uploaders";
import { ScreenGrid } from "./_components/ScreenGrid";
import type {
  PlaylistEntryWithMedia,
  PlaylistItemWithMedia,
  ScheduledPlayback,
  ScreenGroupMember,
  SetupItemWithMedia,
  SetupWithItems,
} from "@/types/domain";
import type { PlaylistWithEntries } from "../library/_components/PlaylistSection";
import { decksWithPages } from "../library/page";

export default async function DashboardPage() {
  const viewer = await pageViewer("screens");
  const admin = createAdminClient();

  // Previews show what each screen's player last reported it was showing
  // (screen_status, see 0025) — this is the snapshot for the first paint,
  // which useScreenStatuses keeps live from there.
  //
  // The folders/media/playlists below feed each screen's Playback Menu,
  // which shows the same file tree and playlists as the Library page.
  const [
    { data: screens, error: screensError },
    { data: playlistItems, error: playlistError },
    { data: folders, error: foldersError },
    { data: media, error: mediaError },
    { data: playlists, error: playlistsError },
    { data: playlistEntries, error: entriesError },
    { data: schedules, error: schedulesError },
    { data: decks, error: decksError },
    { data: statuses, error: statusesError },
    uploaders,
    { data: groups, error: groupsError },
    { data: members, error: membersError },
    { data: setups, error: setupsError },
    { data: setupItems, error: setupItemsError },
  ] = await Promise.all([
    admin
      .from("screens")
      .select("*")
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    admin
      .from("playlist_items")
      .select("*, media_item:media_items(*)")
      .order("screen_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
    admin.from("playlists").select("*").order("position", { ascending: true }),
    admin
      .from("playlist_entries")
      .select("*, media_item:media_items(*)")
      .order("playlist_id", { ascending: true })
      .order("position", { ascending: true }),
    admin.from("scheduled_playbacks").select("*").order("run_at", { ascending: true }),
    admin.from("decks").select("*").order("created_at", { ascending: false }),
    admin.from("screen_status_live").select("*"),
    fetchUploaderNames(admin),
    admin
      .from("screen_groups")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    admin.from("screen_group_members").select("*").order("slot", { ascending: true }),
    admin.from("setups").select("*"),
    admin
      .from("setup_items")
      .select("*, media_item:media_items(*)")
      .order("setup_id", { ascending: true })
      .order("position", { ascending: true }),
  ]);

  if (screensError) throw new Error(screensError.message);
  if (decksError) throw new Error(decksError.message);
  if (playlistError) throw new Error(playlistError.message);
  if (foldersError) throw new Error(foldersError.message);
  if (mediaError) throw new Error(mediaError.message);
  if (playlistsError) throw new Error(playlistsError.message);
  if (entriesError) throw new Error(entriesError.message);
  // Groups and setups (0030) aren't optional: every Playback Menu edits a
  // setup now, so there's nothing sensible to fall back to without them.
  for (const err of [groupsError, membersError, setupsError, setupItemsError]) {
    if (!err) continue;
    if (err.code === "PGRST205" || err.code === "42P01") {
      throw new Error("Screen groups need migration 0030_screen_groups_and_setups.sql — run it in Supabase's SQL Editor.");
    }
    throw new Error(err.message);
  }
  // Tolerated until 0011_scheduled_playbacks.sql has been run — the table
  // simply isn't there yet, which shouldn't take the whole dashboard down.
  if (schedulesError) {
    if (schedulesError.code !== "PGRST205" && schedulesError.code !== "42P01") throw new Error(schedulesError.message);
    console.warn("scheduled_playbacks unavailable — has migration 0011 been run?", schedulesError.message);
  }

  // Tolerated the same way until 0025_screen_status.sql has been run — the
  // tiles then just show what's assigned, as before.
  if (statusesError) {
    if (statusesError.code !== "PGRST205" && statusesError.code !== "42P01") throw new Error(statusesError.message);
    console.warn("screen_status unavailable — has migration 0025 been run?", statusesError.message);
  }

  const playlistsByScreen = new Map<number, PlaylistItemWithMedia[]>();
  for (const item of (playlistItems ?? []) as unknown as PlaylistItemWithMedia[]) {
    const list = playlistsByScreen.get(item.screen_id);
    if (list) list.push(item);
    else playlistsByScreen.set(item.screen_id, [item]);
  }

  const schedulesByScreen = new Map<number, ScheduledPlayback[]>();
  for (const schedule of schedules ?? []) {
    const list = schedulesByScreen.get(schedule.screen_id);
    if (list) list.push(schedule);
    else schedulesByScreen.set(schedule.screen_id, [schedule]);
  }

  const itemsBySetup = new Map<string, SetupItemWithMedia[]>();
  for (const item of (setupItems ?? []) as unknown as SetupItemWithMedia[]) {
    const list = itemsBySetup.get(item.setup_id);
    if (list) list.push(item);
    else itemsBySetup.set(item.setup_id, [item]);
  }
  const setupByScreen = new Map<number, SetupWithItems>();
  const setupByGroup = new Map<string, SetupWithItems>();
  for (const setup of setups ?? []) {
    const withItems = { ...setup, items: itemsBySetup.get(setup.id) ?? [] };
    if (setup.screen_id !== null) setupByScreen.set(setup.screen_id, withItems);
    if (setup.group_id !== null) setupByGroup.set(setup.group_id, withItems);
  }

  const screensWithPlaylists = (screens ?? []).flatMap((screen) => {
    // The trigger in 0030 gives every screen one; a screen without would
    // only be one inserted mid-render, which the next refresh brings in.
    const setup = setupByScreen.get(screen.id);
    if (!setup) return [];
    return [
      {
        ...screen,
        playlist: playlistsByScreen.get(screen.id) ?? [],
        schedules: schedulesByScreen.get(screen.id) ?? [],
        setup,
      },
    ];
  });

  const membersByGroup = new Map<string, ScreenGroupMember[]>();
  for (const member of members ?? []) {
    const list = membersByGroup.get(member.group_id);
    if (list) list.push(member);
    else membersByGroup.set(member.group_id, [member]);
  }
  // Only the screens and groups the viewer's roles let them see make it to
  // the page. A visible group still shows all of its members on its tile,
  // hidden ones included — controlling the group plays on all of them.
  const groupsWithMembers = (groups ?? []).flatMap((group) => {
    if (!canSeeGroup(viewer.access, group.id)) return [];
    const setup = setupByGroup.get(group.id);
    if (!setup) return [];
    return [{ ...group, members: membersByGroup.get(group.id) ?? [], setup }];
  });

  const entriesByPlaylist = new Map<string, PlaylistEntryWithMedia[]>();
  for (const entry of (playlistEntries ?? []) as unknown as PlaylistEntryWithMedia[]) {
    const list = entriesByPlaylist.get(entry.playlist_id);
    if (list) list.push(entry);
    else entriesByPlaylist.set(entry.playlist_id, [entry]);
  }

  const playlistsWithEntries: PlaylistWithEntries[] = (playlists ?? []).map((playlist) => ({
    ...playlist,
    entries: entriesByPlaylist.get(playlist.id) ?? [],
  }));

  const visibleScreens = screensWithPlaylists.filter((screen) => canSeeScreen(viewer.access, screen.id));
  const inVisibleGroups = new Set(groupsWithMembers.flatMap((group) => group.members.map((m) => m.screen_id)));
  const memberOnlyScreens = screensWithPlaylists.filter(
    (screen) => !canSeeScreen(viewer.access, screen.id) && inVisibleGroups.has(screen.id),
  );

  return (
    <ScreenGrid
      screens={visibleScreens}
      memberOnlyScreens={memberOnlyScreens}
      groups={groupsWithMembers}
      statuses={statusesError ? null : (statuses ?? [])}
      library={{
        folders: folders ?? [],
        media: media ?? [],
        decks: decksWithPages(decks ?? [], media ?? []),
        playlists: playlistsWithEntries,
        uploaders,
      }}
    />
  );
}
