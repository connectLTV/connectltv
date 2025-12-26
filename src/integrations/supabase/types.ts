export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chunks: {
        Row: {
          chunk_id: string
          chunk_type: string
          created_at: string | null
          embedding: string | null
          person_id: string
          source_id: string | null
          text_hash: string
          text_norm: string | null
          text_raw: string
          updated_at: string | null
        }
        Insert: {
          chunk_id?: string
          chunk_type: string
          created_at?: string | null
          embedding?: string | null
          person_id: string
          source_id?: string | null
          text_hash: string
          text_norm?: string | null
          text_raw: string
          updated_at?: string | null
        }
        Update: {
          chunk_id?: string
          chunk_type?: string
          created_at?: string | null
          embedding?: string | null
          person_id?: string
          source_id?: string | null
          text_hash?: string
          text_norm?: string | null
          text_raw?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
        ]
      }
      educations: {
        Row: {
          created_at: string | null
          degree: string | null
          description: string | null
          edu_id: string
          end_year: number | null
          field: string | null
          person_id: string
          school: string | null
          start_year: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          degree?: string | null
          description?: string | null
          edu_id?: string
          end_year?: number | null
          field?: string | null
          person_id: string
          school?: string | null
          start_year?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          degree?: string | null
          description?: string | null
          edu_id?: string
          end_year?: number | null
          field?: string | null
          person_id?: string
          school?: string | null
          start_year?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "educations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
        ]
      }
      experiences: {
        Row: {
          company: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          exp_id: string
          location: string | null
          person_id: string
          sort_index: number | null
          start_date: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          exp_id?: string
          location?: string | null
          person_id: string
          sort_index?: number | null
          start_date?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          exp_id?: string
          location?: string | null
          person_id?: string
          sort_index?: number | null
          start_date?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["person_id"]
          },
        ]
      }
      "LTV Alumni Database Enriched": {
        Row: {
          "Class Year": string | null
          Education: string | null
          "Email Address": string | null
          Experiences: string | null
          "First Name": string | null
          Headline: string | null
          "Last Name": string | null
          "LinkedIn URL": string | null
          Location: string | null
          "LTV Instructor(s)": string | null
          Occupation: string | null
          Summary: string | null
          User_ID: number
        }
        Insert: {
          "Class Year"?: string | null
          Education?: string | null
          "Email Address"?: string | null
          Experiences?: string | null
          "First Name"?: string | null
          Headline?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Occupation?: string | null
          Summary?: string | null
          User_ID: number
        }
        Update: {
          "Class Year"?: string | null
          Education?: string | null
          "Email Address"?: string | null
          Experiences?: string | null
          "First Name"?: string | null
          Headline?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Occupation?: string | null
          Summary?: string | null
          User_ID?: number
        }
        Relationships: []
      }
      "LTV Alumni Database Enriched with Embeddings": {
        Row: {
          "Class Year": string | null
          Education: string | null
          "Email Address": string | null
          embedding: Json | null
          embedding_vec: string | null
          Experiences: string | null
          "First Name": string | null
          Headline: string | null
          "Last Name": string | null
          "LinkedIn URL": string | null
          Location: string | null
          "LTV Instructor(s)": string | null
          Occupation: string | null
          Summary: string | null
          User_ID: number
        }
        Insert: {
          "Class Year"?: string | null
          Education?: string | null
          "Email Address"?: string | null
          embedding?: Json | null
          embedding_vec?: string | null
          Experiences?: string | null
          "First Name"?: string | null
          Headline?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Occupation?: string | null
          Summary?: string | null
          User_ID: number
        }
        Update: {
          "Class Year"?: string | null
          Education?: string | null
          "Email Address"?: string | null
          embedding?: Json | null
          embedding_vec?: string | null
          Experiences?: string | null
          "First Name"?: string | null
          Headline?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Occupation?: string | null
          Summary?: string | null
          User_ID?: number
        }
        Relationships: []
      }
      "LTVAlumni Database (Spring 2025)": {
        Row: {
          "Class Year": string | null
          Company: string | null
          "Email Address": string | null
          "First Name": string | null
          "Last Name": string | null
          "LinkedIn URL": string | null
          Location: string | null
          "LTV Instructor(s)": string | null
          Title: string | null
          User_ID: number
        }
        Insert: {
          "Class Year"?: string | null
          Company?: string | null
          "Email Address"?: string | null
          "First Name"?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Title?: string | null
          User_ID: number
        }
        Update: {
          "Class Year"?: string | null
          Company?: string | null
          "Email Address"?: string | null
          "First Name"?: string | null
          "Last Name"?: string | null
          "LinkedIn URL"?: string | null
          Location?: string | null
          "LTV Instructor(s)"?: string | null
          Title?: string | null
          User_ID?: number
        }
        Relationships: []
      }
      people: {
        Row: {
          class_year: number | null
          created_at: string | null
          email: string | null
          full_name: string
          headline: string | null
          linkedin_url: string | null
          person_id: string
          section: string | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          class_year?: number | null
          created_at?: string | null
          email?: string | null
          full_name: string
          headline?: string | null
          linkedin_url?: string | null
          person_id?: string
          section?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          class_year?: number | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          headline?: string | null
          linkedin_url?: string | null
          person_id?: string
          section?: string | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      binary_quantize: {
        Args: { "": string } | { "": unknown }
        Returns: unknown
      }
      halfvec_avg: {
        Args: { "": number[] }
        Returns: unknown
      }
      halfvec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      halfvec_send: {
        Args: { "": unknown }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      hnsw_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      hnswhandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: { "": unknown }
        Returns: unknown
      }
      ivfflathandler: {
        Args: { "": unknown }
        Returns: unknown
      }
      l2_norm: {
        Args: { "": unknown } | { "": unknown }
        Returns: number
      }
      l2_normalize: {
        Args: { "": string } | { "": unknown } | { "": unknown }
        Returns: unknown
      }
      query_alumni_with_similarity: {
        Args: { query_embedding: string }
        Returns: {
          "Class Year": string
          Education: string
          "Email Address": string
          Experiences: string
          "First Name": string
          Headline: string
          "Last Name": string
          "LinkedIn URL": string
          Location: string
          similarity: number
          Summary: string
          User_ID: number
        }[]
      }
      sparsevec_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      sparsevec_send: {
        Args: { "": unknown }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
      vector_avg: {
        Args: { "": number[] }
        Returns: string
      }
      vector_dims: {
        Args: { "": string } | { "": unknown }
        Returns: number
      }
      vector_norm: {
        Args: { "": string }
        Returns: number
      }
      vector_out: {
        Args: { "": string }
        Returns: unknown
      }
      vector_send: {
        Args: { "": string }
        Returns: string
      }
      vector_typmod_in: {
        Args: { "": unknown[] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
