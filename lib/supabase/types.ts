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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assessments: {
        Row: {
          claimed_at: string | null
          created_at: string
          destination_id: string
          expires_at: string
          id: string
          is_primary: boolean
          owner: string | null
          profile_snapshot: Json
          result: Json
          rule_version: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          destination_id: string
          expires_at: string
          id?: string
          is_primary?: boolean
          owner?: string | null
          profile_snapshot: Json
          result: Json
          rule_version: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          destination_id?: string
          expires_at?: string
          id?: string
          is_primary?: boolean
          owner?: string | null
          profile_snapshot?: Json
          result?: Json
          rule_version?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          file_path: string
          file_size: number
          id: string
          kind: string
          original_name: string
          owner: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_size: number
          id?: string
          kind: string
          original_name: string
          owner: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_size?: number
          id?: string
          kind?: string
          original_name?: string
          owner?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assessment_id: string | null
          consent_at: string
          created_at: string
          email: string
          id: string
        }
        Insert: {
          assessment_id?: string | null
          consent_at?: string
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          assessment_id?: string | null
          consent_at?: string
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          body: string | null
          completed_at: string | null
          created_at: string
          id: number
          impact: string
          kind: string
          lift_estimate: string | null
          owner: string
          started_at: string | null
          status: string
          time_estimate: string | null
          title: string
        }
        Insert: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: never
          impact: string
          kind: string
          lift_estimate?: string | null
          owner: string
          started_at?: string | null
          status?: string
          time_estimate?: string | null
          title: string
        }
        Update: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          id?: never
          impact?: string
          kind?: string
          lift_estimate?: string | null
          owner?: string
          started_at?: string | null
          status?: string
          time_estimate?: string | null
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          completeness: number
          created_at: string
          id: string
          owner: string
          sections: Json
          updated_at: string
        }
        Insert: {
          completeness?: number
          created_at?: string
          id?: string
          owner: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          completeness?: number
          created_at?: string
          id?: string
          owner?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          data_quality: string
          duration_years: number | null
          field: string
          finding_refs: string[]
          generated: boolean
          id: string
          intakes: string[]
          last_verified: string | null
          level: string
          min_english: number | null
          min_english_band: number | null
          min_grade: number | null
          name: string
          notes: string | null
          source: string | null
          tuition_currency: string
          tuition_max: number | null
          tuition_min: number | null
          university_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_quality?: string
          duration_years?: number | null
          field: string
          finding_refs?: string[]
          generated?: boolean
          id: string
          intakes?: string[]
          last_verified?: string | null
          level: string
          min_english?: number | null
          min_english_band?: number | null
          min_grade?: number | null
          name: string
          notes?: string | null
          source?: string | null
          tuition_currency?: string
          tuition_max?: number | null
          tuition_min?: number | null
          university_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_quality?: string
          duration_years?: number | null
          field?: string
          finding_refs?: string[]
          generated?: boolean
          id?: string
          intakes?: string[]
          last_verified?: string | null
          level?: string
          min_english?: number | null
          min_english_band?: number | null
          min_grade?: number | null
          name?: string
          notes?: string | null
          source?: string | null
          tuition_currency?: string
          tuition_max?: number | null
          tuition_min?: number | null
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          city: string
          country: string
          created_at: string
          data_quality: string
          id: string
          last_verified: string | null
          name: string
          ranking_tier: number
          source: string | null
          updated_at: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          data_quality?: string
          id: string
          last_verified?: string | null
          name: string
          ranking_tier: number
          source?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          data_quality?: string
          id?: string
          last_verified?: string | null
          name?: string
          ranking_tier?: number
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_program_state: {
        Row: {
          created_at: string
          notes: string | null
          owner: string
          program_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          owner: string
          program_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          owner?: string
          program_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_program_state_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_predictions: {
        Row: {
          assessment_id: string
          id: string
          owner: string
          predicted_at: string
          program_id: string
          rule_version: string
          score_snapshot: Json
          supersedes_prediction_id: string | null
          verdict: string
        }
        Insert: {
          assessment_id: string
          id?: string
          owner: string
          predicted_at?: string
          program_id: string
          rule_version: string
          score_snapshot: Json
          supersedes_prediction_id?: string | null
          verdict: string
        }
        Update: {
          assessment_id?: string
          id?: string
          owner?: string
          predicted_at?: string
          program_id?: string
          rule_version?: string
          score_snapshot?: Json
          supersedes_prediction_id?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_predictions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_predictions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_predictions_supersedes_prediction_id_fkey"
            columns: ["supersedes_prediction_id"]
            isOneToOne: false
            referencedRelation: "program_predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_attempts: {
        Row: {
          created_at: string
          destination: string
          external_ref: string | null
          id: string
          institution_id: string | null
          intake: string | null
          owner: string
          prediction_id: string
          program_id: string
        }
        Insert: {
          created_at?: string
          destination?: string
          external_ref?: string | null
          id?: string
          institution_id?: string | null
          intake?: string | null
          owner: string
          prediction_id: string
          program_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          external_ref?: string | null
          id?: string
          institution_id?: string | null
          intake?: string | null
          owner?: string
          prediction_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_attempts_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "program_predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_attempts_prediction_id_owner_fkey"
            columns: ["prediction_id", "owner"]
            isOneToOne: false
            referencedRelation: "program_predictions"
            referencedColumns: ["id", "owner"]
          },
          {
            foreignKeyName: "application_attempts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_events: {
        Row: {
          attempt_id: string
          decision_authority: string | null
          detail: Json
          event_type: string
          gate: string | null
          id: string
          occurred_at: string
          occurred_on: string | null
          owner: string
          reason_code: string | null
          recorded_at: string
          source: string
          supersedes_event_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          attempt_id: string
          decision_authority?: string | null
          detail?: Json
          event_type: string
          gate?: string | null
          id?: string
          occurred_at: string
          occurred_on?: string | null
          owner: string
          reason_code?: string | null
          recorded_at?: string
          source?: string
          supersedes_event_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          attempt_id?: string
          decision_authority?: string | null
          detail?: Json
          event_type?: string
          gate?: string | null
          id?: string
          occurred_at?: string
          occurred_on?: string | null
          owner?: string
          reason_code?: string | null
          recorded_at?: string
          source?: string
          supersedes_event_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "application_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_events_attempt_id_owner_fkey"
            columns: ["attempt_id", "owner"]
            isOneToOne: false
            referencedRelation: "application_attempts"
            referencedColumns: ["id", "owner"]
          },
          {
            foreignKeyName: "outcome_events_supersedes_event_id_fkey"
            columns: ["supersedes_event_id"]
            isOneToOne: false
            referencedRelation: "outcome_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
