export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      blazepod_sessions: {
        Row: {
          avg_reaction_ms: number | null
          best_reaction_ms: number | null
          created_at: string
          date: string
          drill_type: string | null
          duration_seconds: number | null
          id: string
          raw_data: Json | null
          total_hits: number | null
          user_id: string
        }
        Insert: {
          avg_reaction_ms?: number | null
          best_reaction_ms?: number | null
          created_at?: string
          date: string
          drill_type?: string | null
          duration_seconds?: number | null
          id?: string
          raw_data?: Json | null
          total_hits?: number | null
          user_id: string
        }
        Update: {
          avg_reaction_ms?: number | null
          best_reaction_ms?: number | null
          created_at?: string
          date?: string
          drill_type?: string | null
          duration_seconds?: number | null
          id?: string
          raw_data?: Json | null
          total_hits?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blazepod_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          end_at: string | null
          event_type: string
          id: string
          notes: string | null
          start_at: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          event_type: string
          id?: string
          notes?: string | null
          start_at: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          event_type?: string
          id?: string
          notes?: string | null
          start_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_session_summaries: {
        Row: {
          created_at: string
          id: string
          message_count: number
          session_id: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_count?: number
          session_id: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_count?: number
          session_id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_session_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          academic_stress: number | null
          created_at: string
          date: string
          effort_yesterday: number
          energy: number
          id: string
          intensity: string
          mood: number
          pain_flag: boolean
          pain_location: string | null
          readiness: string
          sleep_hours: number
          soreness: number
          user_id: string
        }
        Insert: {
          academic_stress?: number | null
          created_at?: string
          date: string
          effort_yesterday?: number
          energy: number
          id?: string
          intensity: string
          mood?: number
          pain_flag?: boolean
          pain_location?: string | null
          readiness: string
          sleep_hours: number
          soreness: number
          user_id: string
        }
        Update: {
          academic_stress?: number | null
          created_at?: string
          date?: string
          effort_yesterday?: number
          energy?: number
          id?: string
          intensity?: string
          mood?: number
          pain_flag?: boolean
          pain_location?: string | null
          readiness?: string
          sleep_hours?: number
          soreness?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_records: {
        Row: {
          actual_effort: number | null
          compliant: boolean
          created_at: string
          date: string
          id: string
          notes: string | null
          plan_id: string | null
          user_id: string
        }
        Insert: {
          actual_effort?: number | null
          compliant: boolean
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          user_id: string
        }
        Update: {
          actual_effort?: number | null
          compliant?: boolean
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          active: boolean
          category: string
          content: Json
          created_at: string
          id: string
          key: string
          sort_order: number
          sport_id: string | null
          subcategory: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          content?: Json
          created_at?: string
          id?: string
          key?: string
          sort_order?: number
          sport_id?: string | null
          subcategory?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          content?: Json
          created_at?: string
          id?: string
          key?: string
          sort_order?: number
          sport_id?: string | null
          subcategory?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_periods: {
        Row: {
          auto_detected: boolean
          created_at: string
          end_date: string
          id: string
          name: string
          source: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          auto_detected?: boolean
          created_at?: string
          end_date: string
          id?: string
          name: string
          source?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          auto_detected?: boolean
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          source?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_periods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          coaching_cues: string[] | null
          contraindications: string[] | null
          created_at: string
          difficulty: string | null
          equipment: string | null
          id: string
          muscle_groups: string[] | null
          name: string
          progressions: string[] | null
          regressions: string[] | null
          sport: string | null
          video_url: string | null
        }
        Insert: {
          coaching_cues?: string[] | null
          contraindications?: string[] | null
          created_at?: string
          difficulty?: string | null
          equipment?: string | null
          id?: string
          muscle_groups?: string[] | null
          name: string
          progressions?: string[] | null
          regressions?: string[] | null
          sport?: string | null
          video_url?: string | null
        }
        Update: {
          coaching_cues?: string[] | null
          contraindications?: string[] | null
          created_at?: string
          difficulty?: string | null
          equipment?: string | null
          id?: string
          muscle_groups?: string[] | null
          name?: string
          progressions?: string[] | null
          regressions?: string[] | null
          sport?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      health_data: {
        Row: {
          created_at: string
          date: string
          id: string
          metric_type: string
          source: string | null
          unit: string | null
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metric_type: string
          source?: string | null
          unit?: string | null
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metric_type?: string
          source?: string | null
          unit?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          achieved_at: string
          description: string | null
          id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          achieved_at?: string
          description?: string | null
          id?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          achieved_at?: string
          description?: string | null
          id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_logs: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string
          date: string
          fat_g: number | null
          hydration_ml: number | null
          id: string
          meal_type: string | null
          notes: string | null
          photo_url: string | null
          protein_g: number | null
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date: string
          fat_g?: number | null
          hydration_ml?: number | null
          id?: string
          meal_type?: string | null
          notes?: string | null
          photo_url?: string | null
          protein_g?: number | null
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          date?: string
          fat_g?: number | null
          hydration_ml?: number | null
          id?: string
          meal_type?: string | null
          notes?: string | null
          photo_url?: string | null
          protein_g?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      padel_progress: {
        Row: {
          created_at: string
          id: string
          last_practiced: string | null
          mastery_level: number
          notes: string | null
          shot_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_practiced?: string | null
          mastery_level?: number
          notes?: string | null
          shot_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_practiced?: string | null
          mastery_level?: number
          notes?: string | null
          shot_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "padel_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_test_sessions: {
        Row: {
          created_at: string
          date: string
          id: string
          raw_data: Json | null
          score: number | null
          test_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          raw_data?: Json | null
          score?: number | null
          test_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          raw_data?: Json | null
          score?: number | null
          test_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_test_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          actual_effort: number | null
          alerts: Json
          archetype_message: Json | null
          checkin_id: string | null
          completed_at: string | null
          cooldown: Json
          created_at: string
          date: string
          decision_explanation: Json | null
          disclaimer: string | null
          duration: number
          feedback_notes: string | null
          focus_areas: Json
          id: string
          intensity: string
          main_workout: Json
          modifications: Json
          readiness: string
          recovery_tips: Json
          sport: string
          status: string
          user_id: string
          warmup: Json
          workout_type: string
        }
        Insert: {
          actual_effort?: number | null
          alerts?: Json
          archetype_message?: Json | null
          checkin_id?: string | null
          completed_at?: string | null
          cooldown?: Json
          created_at?: string
          date: string
          decision_explanation?: Json | null
          disclaimer?: string | null
          duration?: number
          feedback_notes?: string | null
          focus_areas?: Json
          id?: string
          intensity: string
          main_workout?: Json
          modifications?: Json
          readiness: string
          recovery_tips?: Json
          sport: string
          status?: string
          user_id: string
          warmup?: Json
          workout_type: string
        }
        Update: {
          actual_effort?: number | null
          alerts?: Json
          archetype_message?: Json | null
          checkin_id?: string | null
          completed_at?: string | null
          cooldown?: Json
          created_at?: string
          date?: string
          decision_explanation?: Json | null
          disclaimer?: string | null
          duration?: number
          feedback_notes?: string | null
          focus_areas?: Json
          id?: string
          intensity?: string
          main_workout?: Json
          modifications?: Json
          readiness?: string
          recovery_tips?: Json
          sport?: string
          status?: string
          user_id?: string
          warmup?: Json
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          compliant: boolean
          created_at: string
          date: string
          id: string
          intensity: string | null
          points: number
          readiness: string | null
          reasons: Json
          user_id: string
        }
        Insert: {
          compliant?: boolean
          created_at?: string
          date: string
          id: string
          intensity?: string | null
          points: number
          readiness?: string | null
          reasons?: Json
          user_id: string
        }
        Update: {
          compliant?: boolean
          created_at?: string
          date?: string
          id?: string
          intensity?: string | null
          points?: number
          readiness?: string | null
          reasons?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      return_to_play: {
        Row: {
          cleared_at: string | null
          created_at: string
          current_stage: number
          id: string
          injury_date: string
          notes: string | null
          pain_location: string | null
          stage_started_at: string
          user_id: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          current_stage?: number
          id?: string
          injury_date: string
          notes?: string | null
          pain_location?: string | null
          stage_started_at?: string
          user_id: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          current_stage?: number
          id?: string
          injury_date?: string
          notes?: string | null
          pain_location?: string | null
          stage_started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_to_play_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sleep_logs: {
        Row: {
          bed_time: string | null
          created_at: string
          date: string
          duration_hours: number | null
          id: string
          quality: number | null
          source: string | null
          user_id: string
          wake_time: string | null
        }
        Insert: {
          bed_time?: string | null
          created_at?: string
          date: string
          duration_hours?: number | null
          id?: string
          quality?: number | null
          source?: string | null
          user_id: string
          wake_time?: string | null
        }
        Update: {
          bed_time?: string | null
          created_at?: string
          date?: string
          duration_hours?: number | null
          id?: string
          quality?: number | null
          source?: string | null
          user_id?: string
          wake_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sleep_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_attributes: {
        Row: {
          abbreviation: string
          color: string
          created_at: string
          description: string
          full_name: string
          id: string
          key: string
          label: string
          max_value: number
          sort_order: number
          sport_id: string
          sub_attributes: Json
          updated_at: string
        }
        Insert: {
          abbreviation?: string
          color?: string
          created_at?: string
          description?: string
          full_name: string
          id?: string
          key: string
          label: string
          max_value?: number
          sort_order?: number
          sport_id: string
          sub_attributes?: Json
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          color?: string
          created_at?: string
          description?: string
          full_name?: string
          id?: string
          key?: string
          label?: string
          max_value?: number
          sort_order?: number
          sport_id?: string
          sub_attributes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_attributes_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_normative_data: {
        Row: {
          age_max: number
          age_min: number
          attribute_key: string
          created_at: string
          direction: string
          id: string
          means: Json
          metric_name: string
          sds: Json
          sport_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          age_max?: number
          age_min?: number
          attribute_key: string
          created_at?: string
          direction: string
          id?: string
          means?: Json
          metric_name: string
          sds?: Json
          sport_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          age_max?: number
          age_min?: number
          attribute_key?: string
          created_at?: string
          direction?: string
          id?: string
          means?: Json
          metric_name?: string
          sds?: Json
          sport_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_normative_data_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_positions: {
        Row: {
          attribute_weights: Json
          created_at: string
          id: string
          key: string
          label: string
          sort_order: number
          sport_id: string
          updated_at: string
        }
        Insert: {
          attribute_weights?: Json
          created_at?: string
          id?: string
          key: string
          label: string
          sort_order?: number
          sport_id: string
          updated_at?: string
        }
        Update: {
          attribute_weights?: Json
          created_at?: string
          id?: string
          key?: string
          label?: string
          sort_order?: number
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_positions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_rating_levels: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          max_rating: number
          min_rating: number
          name: string
          sort_order: number
          sport_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          max_rating: number
          min_rating: number
          name: string
          sort_order?: number
          sport_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          max_rating?: number
          min_rating?: number
          name?: string
          sort_order?: number
          sport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_rating_levels_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_skills: {
        Row: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          key: string
          name: string
          sort_order: number
          sport_id: string
          sub_metrics: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          key: string
          name: string
          sort_order?: number
          sport_id: string
          sub_metrics?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
          sport_id?: string
          sub_metrics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_skills_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_test_definitions: {
        Row: {
          attribute_keys: Json
          color: string
          created_at: string
          derived_metrics: Json
          description: string
          icon: string
          id: string
          inputs: Json
          name: string
          primary_input_key: string
          primary_metric_name: string
          research_note: string
          sort_order: number
          sport_id: string
          test_id: string
          updated_at: string
        }
        Insert: {
          attribute_keys?: Json
          color?: string
          created_at?: string
          derived_metrics?: Json
          description?: string
          icon?: string
          id?: string
          inputs?: Json
          name: string
          primary_input_key?: string
          primary_metric_name?: string
          research_note?: string
          sort_order?: number
          sport_id: string
          test_id: string
          updated_at?: string
        }
        Update: {
          attribute_keys?: Json
          color?: string
          created_at?: string
          derived_metrics?: Json
          description?: string
          icon?: string
          id?: string
          inputs?: Json
          name?: string
          primary_input_key?: string
          primary_metric_name?: string
          research_note?: string
          sort_order?: number
          sport_id?: string
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_test_definitions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          available: boolean
          color: string
          config: Json
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          color?: string
          config?: Json
          created_at?: string
          icon?: string
          id: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          color?: string
          config?: Json
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          block_type: string
          created_at: string
          deload_week: number | null
          end_date: string | null
          focus: string | null
          id: string
          sport: string
          start_date: string
          user_id: string
          week_count: number
        }
        Insert: {
          block_type: string
          created_at?: string
          deload_week?: number | null
          end_date?: string | null
          focus?: string | null
          id?: string
          sport: string
          start_date: string
          user_id: string
          week_count?: number
        }
        Update: {
          block_type?: string
          created_at?: string
          deload_week?: number | null
          end_date?: string | null
          focus?: string | null
          id?: string
          sport?: string
          start_date?: string
          user_id?: string
          week_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          age: number | null
          archetype: string | null
          created_at: string
          current_streak: number
          days_since_rest: number
          display_name: string | null
          email: string
          exam_periods: Json | null
          fcm_token: string | null
          freeze_tokens: number
          health_kit_connected: boolean | null
          id: string
          last_compliant_date: string | null
          longest_streak: number
          name: string
          onboarding_complete: boolean
          parental_consent: boolean | null
          photo_url: string | null
          region: string | null
          school_hours: number | null
          season_phase: string | null
          sport: string
          streak_multiplier: number | null
          team_id: string | null
          total_points: number
          updated_at: string
          weekly_training_days: number | null
        }
        Insert: {
          age?: number | null
          archetype?: string | null
          created_at?: string
          current_streak?: number
          days_since_rest?: number
          display_name?: string | null
          email: string
          exam_periods?: Json | null
          fcm_token?: string | null
          freeze_tokens?: number
          health_kit_connected?: boolean | null
          id: string
          last_compliant_date?: string | null
          longest_streak?: number
          name?: string
          onboarding_complete?: boolean
          parental_consent?: boolean | null
          photo_url?: string | null
          region?: string | null
          school_hours?: number | null
          season_phase?: string | null
          sport?: string
          streak_multiplier?: number | null
          team_id?: string | null
          total_points?: number
          updated_at?: string
          weekly_training_days?: number | null
        }
        Update: {
          age?: number | null
          archetype?: string | null
          created_at?: string
          current_streak?: number
          days_since_rest?: number
          display_name?: string | null
          email?: string
          exam_periods?: Json | null
          fcm_token?: string | null
          freeze_tokens?: number
          health_kit_connected?: boolean | null
          id?: string
          last_compliant_date?: string | null
          longest_streak?: number
          name?: string
          onboarding_complete?: boolean
          parental_consent?: boolean | null
          photo_url?: string | null
          region?: string | null
          school_hours?: number | null
          season_phase?: string | null
          sport?: string
          streak_multiplier?: number | null
          team_id?: string | null
          total_points?: number
          updated_at?: string
          weekly_training_days?: number | null
        }
        Relationships: []
      }
      video_test_results: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          scores: Json | null
          test_type: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          scores?: Json | null
          test_type: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          scores?: Json | null
          test_type?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_test_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          actual_load: number | null
          acute_load: number | null
          acwr: number | null
          block_id: string
          chronic_load: number | null
          created_at: string
          id: string
          target_load: number | null
          user_id: string
          week_number: number
        }
        Insert: {
          actual_load?: number | null
          acute_load?: number | null
          acwr?: number | null
          block_id: string
          chronic_load?: number | null
          created_at?: string
          id?: string
          target_load?: number | null
          user_id: string
          week_number: number
        }
        Update: {
          actual_load?: number | null
          acute_load?: number | null
          acwr?: number | null
          block_id?: string
          chronic_load?: number | null
          created_at?: string
          id?: string
          target_load?: number | null
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          exercise_name: string
          id: string
          notes: string | null
          plan_id: string | null
          reps: number | null
          rpe: number | null
          sets: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          exercise_name: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reps?: number | null
          rpe?: number | null
          sets?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          exercise_name?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
          reps?: number | null
          rpe?: number | null
          sets?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      content_manifest: { Args: never; Returns: Json }
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

