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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      application_attempts: {
        Row: {
          case_id: string | null
          created_at: string
          destination: string
          external_ref: string | null
          id: string
          institution_id: string | null
          intake: string | null
          owner: string | null
          prediction_id: string
          program_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          destination?: string
          external_ref?: string | null
          id?: string
          institution_id?: string | null
          intake?: string | null
          owner?: string | null
          prediction_id: string
          program_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          destination?: string
          external_ref?: string | null
          id?: string
          institution_id?: string | null
          intake?: string | null
          owner?: string | null
          prediction_id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_attempts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_attempts_prediction_id_case_id_fkey"
            columns: ["prediction_id", "case_id"]
            isOneToOne: false
            referencedRelation: "program_predictions"
            referencedColumns: ["id", "case_id"]
          },
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
      assessments: {
        Row: {
          case_id: string | null
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
          case_id?: string | null
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
          case_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "assessments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          case_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          case_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          case_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: []
      }
      case_assignments: {
        Row: {
          assignment_role: string
          case_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_role: string
          case_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_role?: string
          case_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_document_requests: {
        Row: {
          case_id: string
          created_at: string
          due_at: string | null
          id: string
          kind: string
          note: string | null
          organization_id: string
          requested_by: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          kind: string
          note?: string | null
          organization_id: string
          requested_by?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          organization_id?: string
          requested_by?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_document_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_document_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          id: string
          operational_status: string
          organization_id: string | null
          student_user_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          id?: string
          operational_status?: string
          organization_id?: string | null
          student_user_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          id?: string
          operational_status?: string
          organization_id?: string | null
          student_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_status: {
        Row: {
          case_id: string | null
          id: string
          kind: string
          obtained: boolean
          owner: string | null
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          id?: string
          kind: string
          obtained?: boolean
          owner?: string | null
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          id?: string
          kind?: string
          obtained?: boolean
          owner?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_status_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          created_at: string
          file_path: string
          file_size: number
          id: string
          kind: string
          original_name: string
          owner: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          file_path: string
          file_size: number
          id?: string
          kind: string
          original_name: string
          owner?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          file_path?: string
          file_size?: number
          id?: string
          kind?: string
          original_name?: string
          owner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          case_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string | null
          revoked_at: string | null
          role: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          case_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id?: string | null
          revoked_at?: string | null
          role: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          case_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string | null
          revoked_at?: string | null
          role?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      outcome_events: {
        Row: {
          attempt_id: string
          case_id: string | null
          decision_authority: string | null
          detail: Json
          event_type: string
          gate: string | null
          id: string
          occurred_at: string
          occurred_on: string | null
          owner: string | null
          reason_code: string | null
          recorded_at: string
          source: string
          supersedes_event_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          attempt_id: string
          case_id?: string | null
          decision_authority?: string | null
          detail?: Json
          event_type: string
          gate?: string | null
          id?: string
          occurred_at: string
          occurred_on?: string | null
          owner?: string | null
          reason_code?: string | null
          recorded_at?: string
          source?: string
          supersedes_event_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          attempt_id?: string
          case_id?: string | null
          decision_authority?: string | null
          detail?: Json
          event_type?: string
          gate?: string | null
          id?: string
          occurred_at?: string
          occurred_on?: string | null
          owner?: string | null
          reason_code?: string | null
          recorded_at?: string
          source?: string
          supersedes_event_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_events_attempt_id_case_id_fkey"
            columns: ["attempt_id", "case_id"]
            isOneToOne: false
            referencedRelation: "application_attempts"
            referencedColumns: ["id", "case_id"]
          },
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
            foreignKeyName: "outcome_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
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
      plan_items: {
        Row: {
          body: string | null
          case_id: string | null
          completed_at: string | null
          created_at: string
          id: number
          impact: string
          kind: string
          lift_estimate: string | null
          owner: string | null
          started_at: string | null
          status: string
          time_estimate: string | null
          title: string
        }
        Insert: {
          body?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: never
          impact: string
          kind: string
          lift_estimate?: string | null
          owner?: string | null
          started_at?: string | null
          status?: string
          time_estimate?: string | null
          title: string
        }
        Update: {
          body?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: never
          impact?: string
          kind?: string
          lift_estimate?: string | null
          owner?: string | null
          started_at?: string | null
          status?: string
          time_estimate?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          case_id: string | null
          completeness: number
          created_at: string
          id: string
          owner: string | null
          sections: Json
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          completeness?: number
          created_at?: string
          id?: string
          owner?: string | null
          sections?: Json
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          completeness?: number
          created_at?: string
          id?: string
          owner?: string | null
          sections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      program_predictions: {
        Row: {
          assessment_id: string
          case_id: string | null
          id: string
          owner: string | null
          predicted_at: string
          program_id: string
          rule_version: string
          score_snapshot: Json
          supersedes_prediction_id: string | null
          verdict: string
        }
        Insert: {
          assessment_id: string
          case_id?: string | null
          id?: string
          owner?: string | null
          predicted_at?: string
          program_id: string
          rule_version: string
          score_snapshot: Json
          supersedes_prediction_id?: string | null
          verdict: string
        }
        Update: {
          assessment_id?: string
          case_id?: string | null
          id?: string
          owner?: string | null
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
            foreignKeyName: "program_predictions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
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
          case_id: string | null
          created_at: string
          id: string
          notes: string | null
          owner: string | null
          program_id: string
          status: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner?: string | null
          program_id: string
          status: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner?: string | null
          program_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_program_state_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_program_state_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

