// Hand-written to match supabase/migrations/0001_init.sql.
// Once the Supabase project exists, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
// and this file can be replaced outright — the shape below matches what that
// command produces, so nothing else in the app needs to change.

export type ScreenOrientation = "landscape" | "portrait";
export type MediaType = "image" | "video" | "pdf";
export type FitMode = "contain" | "cover";

export type Database = {
  public: {
    Tables: {
      screens: {
        Row: {
          id: number;
          name: string;
          orientation: ScreenOrientation;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name?: string;
          orientation?: ScreenOrientation;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          orientation?: ScreenOrientation;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
