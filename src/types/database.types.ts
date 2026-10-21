// Hand-written to match supabase/migrations/0001_init.sql.
// Once the Supabase project exists, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
// and this file can be replaced outright — the shape below matches what that
// command produces, so nothing else in the app needs to change.

// "page" is a built-in, code-rendered slide — see src/components/screenPages.
export type MediaType = "image" | "video" | "pdf" | "page";
export type FitMode = "contain" | "cover";
// Degrees the screen is physically mounted rotated counterclockwise from
// upright landscape — the only four quarter-turns a TV can actually sit at.
export type ScreenRotation = 0 | 90 | 180 | 270;
// What shows wherever media doesn't cover the screen — letterbox bars, the
// clock page's face, the QR placeholder.
export type ScreenBackground = "black" | "white";
// How one slide gives way to the next — see 0017_screen_transition.sql.
export type ScreenTransition = "cut" | "dip" | "crossfade" | "slide";
// How long that transition runs — the player maps these to milliseconds.
export type ScreenTransitionSpeed = "fast" | "normal" | "slow";
// Which edge a sliding transition enters from — see 0021.
export type ScreenSlideDirection = "right" | "left" | "top" | "bottom";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      screens: {
        Row: {
          id: number;
          name: string;
          fit_mode: FitMode;
          rotation: ScreenRotation;
          background: ScreenBackground;
          transition: ScreenTransition;
          transition_speed: ScreenTransitionSpeed;
          slide_direction: ScreenSlideDirection;
          live_setup_id: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name?: string;
          fit_mode?: FitMode;
          rotation?: ScreenRotation;
          background?: ScreenBackground;
          transition?: ScreenTransition;
          transition_speed?: ScreenTransitionSpeed;
          slide_direction?: ScreenSlideDirection;
          live_setup_id?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          fit_mode?: FitMode;
          rotation?: ScreenRotation;
          background?: ScreenBackground;
          transition?: ScreenTransition;
          transition_speed?: ScreenTransitionSpeed;
          slide_direction?: ScreenSlideDirection;
          live_setup_id?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          created_at: string;
          // Who made it (0028).
          created_by: string | null;
          // Roles allowed to edit it besides its owner; empty = anyone (0032).
          edit_role_ids: string[];
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          created_at?: string;
          created_by?: string | null;
          edit_role_ids?: string[];
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          created_at?: string;
          created_by?: string | null;
          edit_role_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      folder_upload_links: {
        Row: {
          folder_id: string;
          token: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          folder_id: string;
          token: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          folder_id?: string;
          token?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folder_upload_links_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: true;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      media_items: {
        Row: {
          id: string;
          folder_id: string | null;
          name: string;
          storage_path: string;
          media_type: MediaType;
          mime_type: string;
          size_bytes: number | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          deck_id: string | null;
          deck_position: number | null;
          created_at: string;
          // Who added it (0027): a signed-in user, or an upload link.
          uploaded_by: string | null;
          uploaded_via_link: boolean;
          // The folder whose upload link it came in through (0028).
          upload_link_folder_id: string | null;
          // Roles allowed to edit it besides its owner; empty = anyone (0032).
          edit_role_ids: string[];
        };
        Insert: {
          id?: string;
          folder_id?: string | null;
          name: string;
          storage_path: string;
          media_type: MediaType;
          mime_type: string;
          size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          deck_id?: string | null;
          deck_position?: number | null;
          created_at?: string;
          uploaded_by?: string | null;
          uploaded_via_link?: boolean;
          upload_link_folder_id?: string | null;
          edit_role_ids?: string[];
        };
        Update: {
          id?: string;
          folder_id?: string | null;
          name?: string;
          storage_path?: string;
          media_type?: MediaType;
          mime_type?: string;
          size_bytes?: number | null;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          deck_id?: string | null;
          deck_position?: number | null;
          created_at?: string;
          uploaded_by?: string | null;
          uploaded_via_link?: boolean;
          upload_link_folder_id?: string | null;
          edit_role_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "media_items_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_items_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
        ];
      };
      decks: {
        Row: {
          id: string;
          folder_id: string | null;
          name: string;
          storage_path: string;
          mime_type: string;
          size_bytes: number | null;
          page_count: number;
          created_at: string;
          // Who added it (0027): a signed-in user, or an upload link.
          uploaded_by: string | null;
          uploaded_via_link: boolean;
          // The folder whose upload link it came in through (0028).
          upload_link_folder_id: string | null;
          // Roles allowed to edit it besides its owner; empty = anyone (0032).
          edit_role_ids: string[];
        };
        Insert: {
          id?: string;
          folder_id?: string | null;
          name: string;
          storage_path: string;
          mime_type?: string;
          size_bytes?: number | null;
          page_count?: number;
          created_at?: string;
          uploaded_by?: string | null;
          uploaded_via_link?: boolean;
          upload_link_folder_id?: string | null;
          edit_role_ids?: string[];
        };
        Update: {
          id?: string;
          folder_id?: string | null;
          name?: string;
          storage_path?: string;
          mime_type?: string;
          size_bytes?: number | null;
          page_count?: number;
          created_at?: string;
          uploaded_by?: string | null;
          uploaded_via_link?: boolean;
          upload_link_folder_id?: string | null;
          edit_role_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "decks_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      playlist_items: {
        Row: {
          id: string;
          screen_id: number;
          media_item_id: string;
          position: number;
          duration_seconds: number;
          fit_mode: FitMode;
          created_at: string;
        };
        Insert: {
          id?: string;
          screen_id: number;
          media_item_id: string;
          position: number;
          duration_seconds?: number;
          fit_mode?: FitMode;
          created_at?: string;
        };
        Update: {
          id?: string;
          screen_id?: number;
          media_item_id?: string;
          position?: number;
          duration_seconds?: number;
          fit_mode?: FitMode;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playlist_items_screen_id_fkey";
            columns: ["screen_id"];
            isOneToOne: false;
            referencedRelation: "screens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlist_items_media_item_id_fkey";
            columns: ["media_item_id"];
            isOneToOne: false;
            referencedRelation: "media_items";
            referencedColumns: ["id"];
          },
        ];
      };
      playlists: {
        Row: {
          id: string;
          name: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      playlist_entries: {
        Row: {
          id: string;
          playlist_id: string;
          media_item_id: string;
          position: number;
          duration_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          media_item_id: string;
          position: number;
          duration_seconds?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          playlist_id?: string;
          media_item_id?: string;
          position?: number;
          duration_seconds?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playlist_entries_playlist_id_fkey";
            columns: ["playlist_id"];
            isOneToOne: false;
            referencedRelation: "playlists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlist_entries_media_item_id_fkey";
            columns: ["media_item_id"];
            isOneToOne: false;
            referencedRelation: "media_items";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_playbacks: {
        Row: {
          id: string;
          screen_id: number;
          playlist_id: string;
          run_at: string;
          // End of the window this timer reserves its screen for (0022).
          ends_at: string;
          // Set once it has fired; kept until ends_at so the reservation holds.
          fired_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          screen_id: number;
          playlist_id: string;
          run_at: string;
          ends_at: string;
          fired_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          screen_id?: number;
          playlist_id?: string;
          run_at?: string;
          ends_at?: string;
          fired_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_playbacks_screen_id_fkey";
            columns: ["screen_id"];
            isOneToOne: false;
            referencedRelation: "screens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_playbacks_playlist_id_fkey";
            columns: ["playlist_id"];
            isOneToOne: false;
            referencedRelation: "playlists";
            referencedColumns: ["id"];
          },
        ];
      };
      // The Forms page's events (0033).
      events: {
        Row: {
          id: string;
          title: string | null;
          customer: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          lead_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string | null;
          customer?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          lead_id?: string | null;
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string | null;
          customer?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          lead_id?: string | null;
          starts_at?: string | null;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string;
          // Unused since roles (0032); kept until a later migration drops it.
          role: string;
          // Can do everything, and counts as holding every role (0032).
          is_super_admin: boolean;
          nickname: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          password_hash: string;
          role?: string;
          is_super_admin?: boolean;
          nickname?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          password_hash?: string;
          role?: string;
          is_super_admin?: boolean;
          nickname?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      signup_invites: {
        Row: {
          token_hash: string;
          created_by: string | null;
          created_at: string;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          nickname: string | null;
          role_ids: string[];
        };
        Insert: {
          token_hash: string;
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          nickname?: string | null;
          role_ids?: string[];
        };
        Update: {
          token_hash?: string;
          created_by?: string | null;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
          used_by?: string | null;
          nickname?: string | null;
          role_ids?: string[];
        };
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: number;
          user_id: string | null;
          user_email: string;
          action: string;
          target: string | null;
          summary: string;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          user_email: string;
          action: string;
          target?: string | null;
          summary: string;
          created_at?: string;
        };
        Update: {
          user_id?: string | null;
          user_email?: string;
          action?: string;
          target?: string | null;
          summary?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // Written only through report_screen_status/report_screen_offline
      // (see 0025_screen_status.sql).
      screen_status: {
        Row: {
          screen_id: number;
          session_id: string;
          media_item_id: string | null;
          paused: boolean;
          position_ms: number | null;
          viewport_width: number | null;
          viewport_height: number | null;
          last_seen_at: string;
          disconnected_at: string | null;
        };
        Insert: {
          screen_id: number;
          session_id: string;
          media_item_id?: string | null;
          paused?: boolean;
          position_ms?: number | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          last_seen_at?: string;
          disconnected_at?: string | null;
        };
        Update: {
          screen_id?: number;
          session_id?: string;
          media_item_id?: string | null;
          paused?: boolean;
          position_ms?: number | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          last_seen_at?: string;
          disconnected_at?: string | null;
        };
        Relationships: [];
      };
      screen_groups: {
        Row: {
          id: string;
          name: string;
          grid_rows: number;
          grid_cols: number;
          fit_mode: FitMode;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name?: string;
          grid_rows?: number;
          grid_cols?: number;
          fit_mode?: FitMode;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          grid_rows?: number;
          grid_cols?: number;
          fit_mode?: FitMode;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      screen_group_members: {
        Row: {
          group_id: string;
          screen_id: number;
          slot: number;
          created_at: string;
        };
        Insert: {
          group_id: string;
          screen_id: number;
          slot: number;
          created_at?: string;
        };
        Update: {
          group_id?: string;
          screen_id?: number;
          slot?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      // A screen's or a group's playback setup — see 0030.
      setups: {
        Row: {
          id: string;
          screen_id: number | null;
          group_id: string | null;
          background: ScreenBackground;
          transition: ScreenTransition;
          transition_speed: ScreenTransitionSpeed;
          slide_direction: ScreenSlideDirection;
          committed_at: string | null;
        };
        Insert: {
          id?: string;
          screen_id?: number | null;
          group_id?: string | null;
          background?: ScreenBackground;
          transition?: ScreenTransition;
          transition_speed?: ScreenTransitionSpeed;
          slide_direction?: ScreenSlideDirection;
          committed_at?: string | null;
        };
        Update: {
          id?: string;
          screen_id?: number | null;
          group_id?: string | null;
          background?: ScreenBackground;
          transition?: ScreenTransition;
          transition_speed?: ScreenTransitionSpeed;
          slide_direction?: ScreenSlideDirection;
          committed_at?: string | null;
        };
        Relationships: [];
      };
      setup_items: {
        Row: {
          id: string;
          setup_id: string;
          media_item_id: string;
          position: number;
          duration_seconds: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          setup_id: string;
          media_item_id: string;
          position: number;
          duration_seconds?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          setup_id?: string;
          media_item_id?: string;
          position?: number;
          duration_seconds?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "setup_items_media_item_id_fkey";
            columns: ["media_item_id"];
            isOneToOne: false;
            referencedRelation: "media_items";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          color: string;
          // See RoleAccess in src/lib/auth/access.ts.
          access: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color: string;
          access?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          access?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          role_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      screen_status_live: {
        Row: {
          screen_id: number;
          media_item_id: string | null;
          paused: boolean;
          disconnected: boolean;
          age_ms: number;
          position_ms: number | null;
          viewport_width: number | null;
          viewport_height: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      reorder_playlist_items: {
        Args: { p_screen_id: number; p_ids: string[] };
        Returns: undefined;
      };
      assign_media_to_screen: {
        Args: { p_screen_id: number; p_media_ids: string[] };
        Returns: undefined;
      };
      next_free_screen_id: {
        Args: Record<string, never>;
        Returns: number;
      };
      reorder_screens: {
        Args: { p_ids: number[] };
        Returns: undefined;
      };
      reorder_playlists: {
        Args: { p_ids: string[] };
        Returns: undefined;
      };
      reorder_playlist_entries: {
        Args: { p_playlist_id: string; p_ids: string[] };
        Returns: undefined;
      };
      add_media_to_playlist: {
        Args: { p_playlist_id: string; p_media_ids: string[] };
        Returns: undefined;
      };
      run_due_scheduled_playbacks: {
        Args: Record<string, never>;
        Returns: number;
      };
      commit_setup: {
        Args: { p_setup_id: string };
        Returns: undefined;
      };
      reorder_setup_items: {
        Args: { p_setup_id: string; p_ids: string[] };
        Returns: undefined;
      };
      reorder_dashboard: {
        Args: { p_keys: string[] };
        Returns: undefined;
      };
      move_group_member: {
        Args: { p_group_id: string; p_screen_id: number; p_slot: number };
        Returns: undefined;
      };
      log_activity: {
        Args: { p_user_id: string; p_user_email: string; p_action: string; p_target: string | null; p_summary: string };
        Returns: undefined;
      };
      report_screen_status: {
        Args: {
          p_screen_id: number;
          p_session_id: string;
          p_media_item_id: string | null;
          p_paused: boolean;
          p_position_ms?: number | null;
        };
        Returns: undefined;
      };
      report_screen_viewport: {
        Args: { p_screen_id: number; p_session_id: string; p_width: number; p_height: number };
        Returns: undefined;
      };
      report_screen_offline: {
        Args: { p_screen_id: number; p_session_id: string };
        Returns: undefined;
      };
      delete_role: {
        Args: { p_role_id: string };
        Returns: undefined;
      };
      redeem_signup_invite: {
        Args: { p_token_hash: string; p_email: string; p_password_hash: string };
        Returns: string | null;
      };
      server_now: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
