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
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          screen_id: number;
          playlist_id: string;
          run_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          screen_id?: number;
          playlist_id?: string;
          run_at?: string;
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
    };
    Views: Record<string, never>;
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
      server_now: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
