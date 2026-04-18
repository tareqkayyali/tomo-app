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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_audit_log: {
        Row: {
          agent_type: string | null
          cost_usd: number | null
          created_at: string
          event_data: Json
          event_type: string
          id: string
          latency_ms: number | null
          session_id: string
          user_id: string
        }
        Insert: {
          agent_type?: string | null
          cost_usd?: number | null
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          latency_ms?: number | null
          session_id: string
          user_id: string
        }
        Update: {
          agent_type?: string | null
          cost_usd?: number | null
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          latency_ms?: number | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_debug_errors: {
        Row: {
          created_at: string
          error_message: string
          error_type: string | null
          id: string
          intent_id: string | null
          node: string | null
          notes: string | null
          request_message: string | null
          resolved_at: string | null
          session_id: string | null
          severity: string
          traceback: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type?: string | null
          id?: string
          intent_id?: string | null
          node?: string | null
          notes?: string | null
          request_message?: string | null
          resolved_at?: string | null
          session_id?: string | null
          severity?: string
          traceback?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string | null
          id?: string
          intent_id?: string | null
          node?: string | null
          notes?: string | null
          request_message?: string | null
          resolved_at?: string | null
          session_id?: string | null
          severity?: string
          traceback?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_debug_requests: {
        Row: {
          agent: string | null
          cost_usd: number | null
          created_at: string
          flow_pattern: string | null
          id: string
          intent_id: string | null
          latency_ms: number | null
          message: string | null
          session_id: string | null
          status: string
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          agent?: string | null
          cost_usd?: number | null
          created_at?: string
          flow_pattern?: string | null
          id?: string
          intent_id?: string | null
          latency_ms?: number | null
          message?: string | null
          session_id?: string | null
          status?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          agent?: string | null
          cost_usd?: number | null
          created_at?: string
          flow_pattern?: string | null
          id?: string
          intent_id?: string | null
          latency_ms?: number | null
          message?: string | null
          session_id?: string | null
          status?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_fixes: {
        Row: {
          after_metric: number | null
          applied_at: string | null
          applied_by: string | null
          before_metric: number | null
          code_change: string | null
          confidence: number
          created_at: string
          description: string
          expected_impact: string | null
          file_path: string | null
          fix_type: string
          id: string
          issue_id: string
          langsmith_metric: string | null
          priority: number
          status: string
          title: string
          verified_at: string | null
        }
        Insert: {
          after_metric?: number | null
          applied_at?: string | null
          applied_by?: string | null
          before_metric?: number | null
          code_change?: string | null
          confidence?: number
          created_at?: string
          description: string
          expected_impact?: string | null
          file_path?: string | null
          fix_type: string
          id?: string
          issue_id: string
          langsmith_metric?: string | null
          priority?: number
          status?: string
          title: string
          verified_at?: string | null
        }
        Update: {
          after_metric?: number | null
          applied_at?: string | null
          applied_by?: string | null
          before_metric?: number | null
          code_change?: string | null
          confidence?: number
          created_at?: string
          description?: string
          expected_impact?: string | null
          file_path?: string | null
          fix_type?: string
          id?: string
          issue_id?: string
          langsmith_metric?: string | null
          priority?: number
          status?: string
          title?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_fixes_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "ai_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_issues: {
        Row: {
          affected_count: number
          created_at: string
          id: string
          issue_type: string
          last_seen_at: string | null
          metadata: Json | null
          pattern_summary: string | null
          recurrence_count: number
          resolved_at: string | null
          sample_run_ids: string[] | null
          severity: string
          status: string
          trend_data: Json | null
          week_start: string
        }
        Insert: {
          affected_count?: number
          created_at?: string
          id?: string
          issue_type: string
          last_seen_at?: string | null
          metadata?: Json | null
          pattern_summary?: string | null
          recurrence_count?: number
          resolved_at?: string | null
          sample_run_ids?: string[] | null
          severity?: string
          status?: string
          trend_data?: Json | null
          week_start: string
        }
        Update: {
          affected_count?: number
          created_at?: string
          id?: string
          issue_type?: string
          last_seen_at?: string | null
          metadata?: Json | null
          pattern_summary?: string | null
          recurrence_count?: number
          resolved_at?: string | null
          sample_run_ids?: string[] | null
          severity?: string
          status?: string
          trend_data?: Json | null
          week_start?: string
        }
        Relationships: []
      }
      ai_monthly_digest: {
        Row: {
          created_at: string
          id: string
          month_start: string
          narrative: string
          stats: Json | null
          top_fixes: Json | null
          top_issues: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          month_start: string
          narrative: string
          stats?: Json | null
          top_fixes?: Json | null
          top_issues?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          month_start?: string
          narrative?: string
          stats?: Json | null
          top_fixes?: Json | null
          top_issues?: Json | null
        }
        Relationships: []
      }
      ai_trace_log: {
        Row: {
          acwr: number | null
          acwr_bucket: string | null
          age_band: string | null
          agent_type: string | null
          assistant_response: string | null
          capsule_type: string | null
          checkin_staleness_days: number | null
          classification_layer: string | null
          confidence_bucket: string | null
          cost_bucket: string | null
          created_at: string
          crisis_detected: boolean | null
          data_confidence_score: number | null
          dual_load_zone: string | null
          has_pending_write: boolean | null
          id: string
          injury_risk: string | null
          intent_id: string | null
          latency_bucket: string | null
          latency_ms: number | null
          medical_warning: boolean | null
          message: string
          path_type: string | null
          ped_detected: boolean | null
          phv_gate_fired: boolean | null
          phv_stage: string | null
          position: string | null
          rag_chunk_count: number | null
          rag_cost_usd: number | null
          rag_entity_count: number | null
          rag_graph_hops: number | null
          rag_latency_ms: number | null
          rag_sub_questions: number | null
          rag_used: boolean | null
          readiness_bucket: string | null
          readiness_rag: string | null
          readiness_score: number | null
          request_id: string
          response_length_chars: number | null
          routing_confidence: number | null
          session_id: string
          sonnet_shadow: Json | null
          sport: string | null
          tool_bucket: string | null
          tool_count: number | null
          tool_names: string[] | null
          total_cost_usd: number | null
          total_tokens: number | null
          turn_number: number | null
          user_id: string
          validation_flag_count: number | null
          validation_flags: string[] | null
          validation_passed: boolean | null
          write_confirmed: boolean | null
        }
        Insert: {
          acwr?: number | null
          acwr_bucket?: string | null
          age_band?: string | null
          agent_type?: string | null
          assistant_response?: string | null
          capsule_type?: string | null
          checkin_staleness_days?: number | null
          classification_layer?: string | null
          confidence_bucket?: string | null
          cost_bucket?: string | null
          created_at?: string
          crisis_detected?: boolean | null
          data_confidence_score?: number | null
          dual_load_zone?: string | null
          has_pending_write?: boolean | null
          id?: string
          injury_risk?: string | null
          intent_id?: string | null
          latency_bucket?: string | null
          latency_ms?: number | null
          medical_warning?: boolean | null
          message?: string
          path_type?: string | null
          ped_detected?: boolean | null
          phv_gate_fired?: boolean | null
          phv_stage?: string | null
          position?: string | null
          rag_chunk_count?: number | null
          rag_cost_usd?: number | null
          rag_entity_count?: number | null
          rag_graph_hops?: number | null
          rag_latency_ms?: number | null
          rag_sub_questions?: number | null
          rag_used?: boolean | null
          readiness_bucket?: string | null
          readiness_rag?: string | null
          readiness_score?: number | null
          request_id: string
          response_length_chars?: number | null
          routing_confidence?: number | null
          session_id: string
          sonnet_shadow?: Json | null
          sport?: string | null
          tool_bucket?: string | null
          tool_count?: number | null
          tool_names?: string[] | null
          total_cost_usd?: number | null
          total_tokens?: number | null
          turn_number?: number | null
          user_id: string
          validation_flag_count?: number | null
          validation_flags?: string[] | null
          validation_passed?: boolean | null
          write_confirmed?: boolean | null
        }
        Update: {
          acwr?: number | null
          acwr_bucket?: string | null
          age_band?: string | null
          agent_type?: string | null
          assistant_response?: string | null
          capsule_type?: string | null
          checkin_staleness_days?: number | null
          classification_layer?: string | null
          confidence_bucket?: string | null
          cost_bucket?: string | null
          created_at?: string
          crisis_detected?: boolean | null
          data_confidence_score?: number | null
          dual_load_zone?: string | null
          has_pending_write?: boolean | null
          id?: string
          injury_risk?: string | null
          intent_id?: string | null
          latency_bucket?: string | null
          latency_ms?: number | null
          medical_warning?: boolean | null
          message?: string
          path_type?: string | null
          ped_detected?: boolean | null
          phv_gate_fired?: boolean | null
          phv_stage?: string | null
          position?: string | null
          rag_chunk_count?: number | null
          rag_cost_usd?: number | null
          rag_entity_count?: number | null
          rag_graph_hops?: number | null
          rag_latency_ms?: number | null
          rag_sub_questions?: number | null
          rag_used?: boolean | null
          readiness_bucket?: string | null
          readiness_rag?: string | null
          readiness_score?: number | null
          request_id?: string
          response_length_chars?: number | null
          routing_confidence?: number | null
          session_id?: string
          sonnet_shadow?: Json | null
          sport?: string | null
          tool_bucket?: string | null
          tool_count?: number | null
          tool_names?: string[] | null
          total_cost_usd?: number | null
          total_tokens?: number | null
          turn_number?: number | null
          user_id?: string
          validation_flag_count?: number | null
          validation_flags?: string[] | null
          validation_passed?: boolean | null
          write_confirmed?: boolean | null
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          agent_type: string | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          classification_layer: string | null
          created_at: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          intent_id: string | null
          latency_ms: number | null
          model: string | null
          output_tokens: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          agent_type?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          classification_layer?: string | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          intent_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          agent_type?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          classification_layer?: string | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          intent_id?: string | null
          latency_ms?: number | null
          model?: string | null
          output_tokens?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_themes: {
        Row: {
          colors_dark: Json
          colors_light: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          typography: Json
          updated_at: string
        }
        Insert: {
          colors_dark?: Json
          colors_light?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          typography?: Json
          updated_at?: string
        }
        Update: {
          colors_dark?: Json
          colors_light?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          typography?: Json
          updated_at?: string
        }
        Relationships: []
      }
      athlete_achievements: {
        Row: {
          category: string
          created_at: string
          date_achieved: string
          description: string | null
          evidence_url: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          date_achieved?: string
          description?: string | null
          evidence_url?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          date_achieved?: string
          description?: string | null
          evidence_url?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      athlete_behavioral_fingerprint: {
        Row: {
          academic_athletic_balance: number | null
          athlete_id: string
          coaching_approach: string | null
          compliance_rate: number | null
          computed_at: string | null
          recovery_response: number | null
          session_consistency: number | null
        }
        Insert: {
          academic_athletic_balance?: number | null
          athlete_id: string
          coaching_approach?: string | null
          compliance_rate?: number | null
          computed_at?: string | null
          recovery_response?: number | null
          session_consistency?: number | null
        }
        Update: {
          academic_athletic_balance?: number | null
          athlete_id?: string
          coaching_approach?: string | null
          compliance_rate?: number | null
          computed_at?: string | null
          recovery_response?: number | null
          session_consistency?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_behavioral_fingerprint_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_benchmark_cache: {
        Row: {
          age_band: string | null
          athlete_id: string
          computed_at: string | null
          expires_at: string | null
          gap_attributes: string[] | null
          gaps: string[] | null
          overall_percentile: number | null
          position: string | null
          results_json: Json | null
          sport: string | null
          strength_attributes: string[] | null
          strengths: string[] | null
          trigger_event_id: string | null
        }
        Insert: {
          age_band?: string | null
          athlete_id: string
          computed_at?: string | null
          expires_at?: string | null
          gap_attributes?: string[] | null
          gaps?: string[] | null
          overall_percentile?: number | null
          position?: string | null
          results_json?: Json | null
          sport?: string | null
          strength_attributes?: string[] | null
          strengths?: string[] | null
          trigger_event_id?: string | null
        }
        Update: {
          age_band?: string | null
          athlete_id?: string
          computed_at?: string | null
          expires_at?: string | null
          gap_attributes?: string[] | null
          gaps?: string[] | null
          overall_percentile?: number | null
          position?: string | null
          results_json?: Json | null
          sport?: string | null
          strength_attributes?: string[] | null
          strengths?: string[] | null
          trigger_event_id?: string | null
        }
        Relationships: []
      }
      athlete_daily_load: {
        Row: {
          academic_load_au: number
          athlete_id: string
          load_date: string
          session_count: number
          training_load_au: number
        }
        Insert: {
          academic_load_au?: number
          athlete_id: string
          load_date: string
          session_count?: number
          training_load_au?: number
        }
        Update: {
          academic_load_au?: number
          athlete_id?: string
          load_date?: string
          session_count?: number
          training_load_au?: number
        }
        Relationships: [
          {
            foreignKeyName: "athlete_daily_load_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_daily_vitals: {
        Row: {
          academic_stress: number | null
          active_calories: number | null
          athlete_id: string
          deep_sleep_min: number | null
          directive_text: string | null
          energy: number | null
          hrv_avg_ms: number | null
          hrv_morning_ms: number | null
          intensity_cap: string | null
          mood: number | null
          pain_flag: boolean | null
          readiness_rag: string | null
          readiness_score: number | null
          recovery_score: number | null
          rem_sleep_min: number | null
          resting_hr_bpm: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          soreness: number | null
          sources_resolved: Json | null
          spo2_percent: number | null
          steps: number | null
          updated_at: string | null
          vitals_date: string
        }
        Insert: {
          academic_stress?: number | null
          active_calories?: number | null
          athlete_id: string
          deep_sleep_min?: number | null
          directive_text?: string | null
          energy?: number | null
          hrv_avg_ms?: number | null
          hrv_morning_ms?: number | null
          intensity_cap?: string | null
          mood?: number | null
          pain_flag?: boolean | null
          readiness_rag?: string | null
          readiness_score?: number | null
          recovery_score?: number | null
          rem_sleep_min?: number | null
          resting_hr_bpm?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          sources_resolved?: Json | null
          spo2_percent?: number | null
          steps?: number | null
          updated_at?: string | null
          vitals_date: string
        }
        Update: {
          academic_stress?: number | null
          active_calories?: number | null
          athlete_id?: string
          deep_sleep_min?: number | null
          directive_text?: string | null
          energy?: number | null
          hrv_avg_ms?: number | null
          hrv_morning_ms?: number | null
          intensity_cap?: string | null
          mood?: number | null
          pain_flag?: boolean | null
          readiness_rag?: string | null
          readiness_score?: number | null
          recovery_score?: number | null
          rem_sleep_min?: number | null
          resting_hr_bpm?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          soreness?: number | null
          sources_resolved?: Json | null
          spo2_percent?: number | null
          steps?: number | null
          updated_at?: string | null
          vitals_date?: string
        }
        Relationships: []
      }
      athlete_events: {
        Row: {
          athlete_id: string
          correction_of: string | null
          created_at: string
          created_by: string
          event_id: string
          event_type: string
          occurred_at: string
          payload: Json
          source: string
        }
        Insert: {
          athlete_id: string
          correction_of?: string | null
          created_at?: string
          created_by: string
          event_id?: string
          event_type: string
          occurred_at: string
          payload?: Json
          source: string
        }
        Update: {
          athlete_id?: string
          correction_of?: string | null
          created_at?: string
          created_by?: string
          event_id?: string
          event_type?: string
          occurred_at?: string
          payload?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_events_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "athlete_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "athlete_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_goals: {
        Row: {
          achieved_at: string | null
          athlete_id: string
          created_at: string | null
          current_value: number | null
          deadline: string | null
          id: string
          status: string | null
          target_unit: string | null
          target_value: number | null
          title: string
        }
        Insert: {
          achieved_at?: string | null
          athlete_id: string
          created_at?: string | null
          current_value?: number | null
          deadline?: string | null
          id?: string
          status?: string | null
          target_unit?: string | null
          target_value?: number | null
          title: string
        }
        Update: {
          achieved_at?: string | null
          athlete_id?: string
          created_at?: string | null
          current_value?: number | null
          deadline?: string | null
          id?: string
          status?: string | null
          target_unit?: string | null
          target_value?: number | null
          title?: string
        }
        Relationships: []
      }
      athlete_injuries: {
        Row: {
          athlete_id: string
          body_location: string
          id: string
          logged_at: string | null
          notes: string | null
          recovered_at: string | null
          severity: number
          status: string | null
        }
        Insert: {
          athlete_id: string
          body_location: string
          id?: string
          logged_at?: string | null
          notes?: string | null
          recovered_at?: string | null
          severity: number
          status?: string | null
        }
        Update: {
          athlete_id?: string
          body_location?: string
          id?: string
          logged_at?: string | null
          notes?: string | null
          recovered_at?: string | null
          severity?: number
          status?: string | null
        }
        Relationships: []
      }
      athlete_intelligence_briefs: {
        Row: {
          acwr: number | null
          age_band: string | null
          athlete_id: string
          cost_usd: number
          created_at: string
          generated_at: string
          id: string
          injury_risk_flag: string | null
          is_current: boolean
          model_used: string
          position: string | null
          readiness_score: string | null
          snapshot_hash: string
          sport: string | null
          summary_text: string
        }
        Insert: {
          acwr?: number | null
          age_band?: string | null
          athlete_id: string
          cost_usd?: number
          created_at?: string
          generated_at?: string
          id?: string
          injury_risk_flag?: string | null
          is_current?: boolean
          model_used?: string
          position?: string | null
          readiness_score?: string | null
          snapshot_hash: string
          sport?: string | null
          summary_text: string
        }
        Update: {
          acwr?: number | null
          age_band?: string | null
          athlete_id?: string
          cost_usd?: number
          created_at?: string
          generated_at?: string
          id?: string
          injury_risk_flag?: string | null
          is_current?: boolean
          model_used?: string
          position?: string | null
          readiness_score?: string | null
          snapshot_hash?: string
          sport?: string | null
          summary_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_intelligence_briefs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_longitudinal_memory: {
        Row: {
          athlete_id: string
          created_at: string | null
          last_session_summary: string | null
          last_updated: string | null
          memory_json: Json
          session_count: number
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          last_session_summary?: string | null
          last_updated?: string | null
          memory_json?: Json
          session_count?: number
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          last_session_summary?: string | null
          last_updated?: string | null
          memory_json?: Json
          session_count?: number
        }
        Relationships: []
      }
      athlete_memory_preferences: {
        Row: {
          athlete_id: string
          created_at: string
          episodic_enabled: boolean
          last_memory_sync: string | null
          longitudinal_enabled: boolean
          procedural_enabled: boolean
          remember_concerns: boolean
          remember_goals: boolean
          remember_injuries: boolean
          remember_preferences: boolean
          semantic_enabled: boolean
          updated_at: string
          zep_session_count: number
          zep_user_created: boolean
        }
        Insert: {
          athlete_id: string
          created_at?: string
          episodic_enabled?: boolean
          last_memory_sync?: string | null
          longitudinal_enabled?: boolean
          procedural_enabled?: boolean
          remember_concerns?: boolean
          remember_goals?: boolean
          remember_injuries?: boolean
          remember_preferences?: boolean
          semantic_enabled?: boolean
          updated_at?: string
          zep_session_count?: number
          zep_user_created?: boolean
        }
        Update: {
          athlete_id?: string
          created_at?: string
          episodic_enabled?: boolean
          last_memory_sync?: string | null
          longitudinal_enabled?: boolean
          procedural_enabled?: boolean
          remember_concerns?: boolean
          remember_goals?: boolean
          remember_injuries?: boolean
          remember_preferences?: boolean
          semantic_enabled?: boolean
          updated_at?: string
          zep_session_count?: number
          zep_user_created?: boolean
        }
        Relationships: []
      }
      athlete_mode_history: {
        Row: {
          athlete_id: string
          changed_at: string | null
          changed_by: string | null
          id: string
          new_mode: string
          previous_mode: string | null
          trigger: string
        }
        Insert: {
          athlete_id: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_mode: string
          previous_mode?: string | null
          trigger: string
        }
        Update: {
          athlete_id?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_mode?: string
          previous_mode?: string | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_mode_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_mode_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_mode_history_new_mode_fkey"
            columns: ["new_mode"]
            isOneToOne: false
            referencedRelation: "athlete_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_modes: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_enabled: boolean | null
          label: string
          params: Json
          sort_order: number | null
          sport_filter: string[] | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          is_enabled?: boolean | null
          label: string
          params?: Json
          sort_order?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          label?: string
          params?: Json
          sort_order?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      athlete_monthly_summary: {
        Row: {
          achievements: Json | null
          age_band: string | null
          amber_days: number | null
          athlete_id: string
          avg_acwr: number | null
          avg_hrv_ms: number | null
          avg_readiness_score: number | null
          avg_sleep_hours: number | null
          benchmark_snapshot: Json | null
          coachability_index: number | null
          computed_at: string | null
          cv_completeness: number | null
          green_days: number | null
          peak_hrv_ms: number | null
          peak_training_load_au: number | null
          phv_stage: string | null
          position: string | null
          red_days: number | null
          summary_month: string
          total_sessions: number | null
          total_training_load_au: number | null
        }
        Insert: {
          achievements?: Json | null
          age_band?: string | null
          amber_days?: number | null
          athlete_id: string
          avg_acwr?: number | null
          avg_hrv_ms?: number | null
          avg_readiness_score?: number | null
          avg_sleep_hours?: number | null
          benchmark_snapshot?: Json | null
          coachability_index?: number | null
          computed_at?: string | null
          cv_completeness?: number | null
          green_days?: number | null
          peak_hrv_ms?: number | null
          peak_training_load_au?: number | null
          phv_stage?: string | null
          position?: string | null
          red_days?: number | null
          summary_month: string
          total_sessions?: number | null
          total_training_load_au?: number | null
        }
        Update: {
          achievements?: Json | null
          age_band?: string | null
          amber_days?: number | null
          athlete_id?: string
          avg_acwr?: number | null
          avg_hrv_ms?: number | null
          avg_readiness_score?: number | null
          avg_sleep_hours?: number | null
          benchmark_snapshot?: Json | null
          coachability_index?: number | null
          computed_at?: string | null
          cv_completeness?: number | null
          green_days?: number | null
          peak_hrv_ms?: number | null
          peak_training_load_au?: number | null
          phv_stage?: string | null
          position?: string | null
          red_days?: number | null
          summary_month?: string
          total_sessions?: number | null
          total_training_load_au?: number | null
        }
        Relationships: []
      }
      athlete_notification_preferences: {
        Row: {
          athlete_id: string
          daily_reminder_time: string | null
          max_push_per_day: number | null
          push_academic: boolean | null
          push_coaching: boolean | null
          push_critical: boolean | null
          push_cv: boolean | null
          push_system: boolean | null
          push_training: boolean | null
          push_triangle: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          school_hours_quiet: boolean | null
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          daily_reminder_time?: string | null
          max_push_per_day?: number | null
          push_academic?: boolean | null
          push_coaching?: boolean | null
          push_critical?: boolean | null
          push_cv?: boolean | null
          push_system?: boolean | null
          push_training?: boolean | null
          push_triangle?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_hours_quiet?: boolean | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          daily_reminder_time?: string | null
          max_push_per_day?: number | null
          push_academic?: boolean | null
          push_coaching?: boolean | null
          push_critical?: boolean | null
          push_cv?: boolean | null
          push_system?: boolean | null
          push_training?: boolean | null
          push_triangle?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          school_hours_quiet?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      athlete_notifications: {
        Row: {
          acted_at: string | null
          athlete_id: string
          body: string
          category: string
          chips: Json | null
          created_at: string | null
          dismissed_at: string | null
          expires_at: string | null
          group_key: string | null
          id: string
          primary_action: Json | null
          priority: number | null
          push_queued: boolean | null
          push_sent: boolean | null
          push_sent_at: string | null
          read_at: string | null
          resolved_at: string | null
          secondary_action: Json | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          acted_at?: string | null
          athlete_id: string
          body: string
          category: string
          chips?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          group_key?: string | null
          id?: string
          primary_action?: Json | null
          priority?: number | null
          push_queued?: boolean | null
          push_sent?: boolean | null
          push_sent_at?: string | null
          read_at?: string | null
          resolved_at?: string | null
          secondary_action?: Json | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          acted_at?: string | null
          athlete_id?: string
          body?: string
          category?: string
          chips?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          expires_at?: string | null
          group_key?: string | null
          id?: string
          primary_action?: Json | null
          priority?: number | null
          push_queued?: boolean | null
          push_sent?: boolean | null
          push_sent_at?: string | null
          read_at?: string | null
          resolved_at?: string | null
          secondary_action?: Json | null
          source_ref_id?: string | null
          source_ref_type?: string | null
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      athlete_nutrition_log: {
        Row: {
          athlete_id: string
          estimated_calories: number | null
          id: string
          logged_at: string | null
          logged_date: string | null
          meal_description: string | null
          notes: string | null
        }
        Insert: {
          athlete_id: string
          estimated_calories?: number | null
          id?: string
          logged_at?: string | null
          logged_date?: string | null
          meal_description?: string | null
          notes?: string | null
        }
        Update: {
          athlete_id?: string
          estimated_calories?: number | null
          id?: string
          logged_at?: string | null
          logged_date?: string | null
          meal_description?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      athlete_recommendations: {
        Row: {
          acted_at: string | null
          athlete_id: string
          body_long: string | null
          body_short: string
          confidence_score: number | null
          context: Json
          created_at: string
          decay_score: number | null
          decayed_at: string | null
          evidence_basis: Json
          expires_at: string | null
          parent_rec_id: string | null
          priority: number
          rec_id: string
          rec_type: string
          retrieved_chunk_ids: string[] | null
          status: string
          title: string
          trigger_event_id: string | null
          visible_to_athlete: boolean
          visible_to_coach: boolean
          visible_to_parent: boolean
        }
        Insert: {
          acted_at?: string | null
          athlete_id: string
          body_long?: string | null
          body_short: string
          confidence_score?: number | null
          context?: Json
          created_at?: string
          decay_score?: number | null
          decayed_at?: string | null
          evidence_basis?: Json
          expires_at?: string | null
          parent_rec_id?: string | null
          priority: number
          rec_id?: string
          rec_type: string
          retrieved_chunk_ids?: string[] | null
          status?: string
          title: string
          trigger_event_id?: string | null
          visible_to_athlete?: boolean
          visible_to_coach?: boolean
          visible_to_parent?: boolean
        }
        Update: {
          acted_at?: string | null
          athlete_id?: string
          body_long?: string | null
          body_short?: string
          confidence_score?: number | null
          context?: Json
          created_at?: string
          decay_score?: number | null
          decayed_at?: string | null
          evidence_basis?: Json
          expires_at?: string | null
          parent_rec_id?: string | null
          priority?: number
          rec_id?: string
          rec_type?: string
          retrieved_chunk_ids?: string[] | null
          status?: string
          title?: string
          trigger_event_id?: string | null
          visible_to_athlete?: boolean
          visible_to_coach?: boolean
          visible_to_parent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "athlete_recommendations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_recommendations_parent_rec_id_fkey"
            columns: ["parent_rec_id"]
            isOneToOne: false
            referencedRelation: "athlete_recommendations"
            referencedColumns: ["rec_id"]
          },
          {
            foreignKeyName: "athlete_recommendations_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "athlete_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      athlete_sleep_manual: {
        Row: {
          athlete_id: string
          hours: number
          id: string
          logged_at: string | null
          quality: number | null
          sleep_date: string | null
        }
        Insert: {
          athlete_id: string
          hours: number
          id?: string
          logged_at?: string | null
          quality?: number | null
          sleep_date?: string | null
        }
        Update: {
          athlete_id?: string
          hours?: number
          id?: string
          logged_at?: string | null
          quality?: number | null
          sleep_date?: string | null
        }
        Relationships: []
      }
      athlete_snapshots: {
        Row: {
          academic_load_7day: number | null
          academic_stress_latest: number | null
          academic_stress_level: number | null
          academic_stress_notes: string | null
          academic_year: number | null
          active_goals_count: number | null
          active_injury_count: number | null
          active_program_count: number | null
          acwr: number | null
          acwr_trend: string | null
          adaptation_coefficient: number | null
          applicable_protocol_ids: string[] | null
          athlete_id: string
          athlete_mode: string | null
          athletic_load_7day: number | null
          atl_7day: number | null
          avg_drill_rating_30d: number | null
          avg_post_body_feel_7d: number | null
          body_feel_trend_7d: number | null
          career_entry_count: number | null
          ccrs: number | null
          ccrs_alert_flags: string[] | null
          ccrs_confidence: string | null
          ccrs_recommendation: string | null
          chat_messages_7d: number | null
          chat_sessions_7d: number | null
          checkin_consistency_7d: number | null
          coachability_adaptation: number | null
          coachability_index: number | null
          coachability_responsiveness: number | null
          coachability_target_rate: number | null
          coaching_preference: string | null
          ctl_28day: number | null
          cv_completeness: number | null
          cv_completeness_club_pct: number | null
          cv_completeness_uni_pct: number | null
          cv_sections_complete: Json | null
          cv_statement_status: string | null
          cv_views_7d: number | null
          cv_views_total: number | null
          data_confidence_breakdown: Json | null
          data_confidence_score: number | null
          data_freshness: string | null
          days_since_coach_interaction: number | null
          days_since_injury: number | null
          days_since_last_session: number | null
          days_since_parent_interaction: number | null
          dob: string | null
          drills_completed_7d: number | null
          dual_load_index: number | null
          dual_load_zone: string | null
          exam_count_active: number | null
          exam_period_training_rate: number | null
          exam_proximity_score: number | null
          exams_next_14d: number | null
          height_cm: number | null
          hrv_baseline_ms: number | null
          hrv_recorded_at: string | null
          hrv_sample_n: number | null
          hrv_sd_30d: number | null
          hrv_today_ms: number | null
          hrv_trend_7d_pct: number | null
          in_exam_period: boolean | null
          injury_locations: Json | null
          injury_risk_flag: string | null
          journal_completeness_7d: number | null
          journal_streak_days: number | null
          key_gaps: Json | null
          last_chat_at: string | null
          last_checkin_at: string | null
          last_event_id: string | null
          last_journal_at: string | null
          last_session_at: string | null
          load_trend_7d_pct: number | null
          longest_streak: number | null
          mastery_scores: Json
          matches_next_7d: number | null
          mode_changed_at: string | null
          notification_action_rate_7d: number | null
          overall_percentile: number | null
          pending_post_journal_count: number | null
          pending_pre_journal_count: number | null
          phv_offset_years: number | null
          phv_stage: string | null
          plan_compliance_7d: number | null
          position: string | null
          post_journal_completion_rate: number | null
          pre_journal_completion_rate: number | null
          program_compliance_rate: number | null
          program_recommendations: Json | null
          readiness_delta: number | null
          readiness_distribution_7d: Json | null
          readiness_rag: string | null
          readiness_score: number | null
          rec_action_rate_30d: number | null
          recovery_score: number | null
          resting_hr_bpm: number | null
          resting_hr_trend_7d: string | null
          season_phase: string | null
          season_phase_week: number | null
          sessions_scheduled_next_7d: number | null
          sessions_total: number
          sitting_height_cm: number | null
          skin_temp_c: number | null
          sleep_consistency_score: number | null
          sleep_debt_3d: number | null
          sleep_hours: number | null
          sleep_quality: number | null
          sleep_recorded_at: string | null
          sleep_trend_7d: string | null
          snapshot_at: string
          speed_profile: Json
          spo2_pct: number | null
          sport: string | null
          streak_days: number
          strength_benchmarks: Json
          study_hours_7d: number | null
          study_training_balance_ratio: number | null
          target_achievement_rate_30d: number | null
          tomo_intelligence_score: number | null
          top_strengths: Json | null
          total_points_7d: number | null
          training_age_months: number | null
          training_age_weeks: number
          training_monotony: number | null
          training_strain: number | null
          triangle_engagement_score: number | null
          triangle_rag: string | null
          unresolved_concerns_count: number | null
          wearable_connected: boolean | null
          wearable_last_sync_at: string | null
          weight_kg: number | null
          wellness_7day_avg: number | null
          wellness_trend: string | null
        }
        Insert: {
          academic_load_7day?: number | null
          academic_stress_latest?: number | null
          academic_stress_level?: number | null
          academic_stress_notes?: string | null
          academic_year?: number | null
          active_goals_count?: number | null
          active_injury_count?: number | null
          active_program_count?: number | null
          acwr?: number | null
          acwr_trend?: string | null
          adaptation_coefficient?: number | null
          applicable_protocol_ids?: string[] | null
          athlete_id: string
          athlete_mode?: string | null
          athletic_load_7day?: number | null
          atl_7day?: number | null
          avg_drill_rating_30d?: number | null
          avg_post_body_feel_7d?: number | null
          body_feel_trend_7d?: number | null
          career_entry_count?: number | null
          ccrs?: number | null
          ccrs_alert_flags?: string[] | null
          ccrs_confidence?: string | null
          ccrs_recommendation?: string | null
          chat_messages_7d?: number | null
          chat_sessions_7d?: number | null
          checkin_consistency_7d?: number | null
          coachability_adaptation?: number | null
          coachability_index?: number | null
          coachability_responsiveness?: number | null
          coachability_target_rate?: number | null
          coaching_preference?: string | null
          ctl_28day?: number | null
          cv_completeness?: number | null
          cv_completeness_club_pct?: number | null
          cv_completeness_uni_pct?: number | null
          cv_sections_complete?: Json | null
          cv_statement_status?: string | null
          cv_views_7d?: number | null
          cv_views_total?: number | null
          data_confidence_breakdown?: Json | null
          data_confidence_score?: number | null
          data_freshness?: string | null
          days_since_coach_interaction?: number | null
          days_since_injury?: number | null
          days_since_last_session?: number | null
          days_since_parent_interaction?: number | null
          dob?: string | null
          drills_completed_7d?: number | null
          dual_load_index?: number | null
          dual_load_zone?: string | null
          exam_count_active?: number | null
          exam_period_training_rate?: number | null
          exam_proximity_score?: number | null
          exams_next_14d?: number | null
          height_cm?: number | null
          hrv_baseline_ms?: number | null
          hrv_recorded_at?: string | null
          hrv_sample_n?: number | null
          hrv_sd_30d?: number | null
          hrv_today_ms?: number | null
          hrv_trend_7d_pct?: number | null
          in_exam_period?: boolean | null
          injury_locations?: Json | null
          injury_risk_flag?: string | null
          journal_completeness_7d?: number | null
          journal_streak_days?: number | null
          key_gaps?: Json | null
          last_chat_at?: string | null
          last_checkin_at?: string | null
          last_event_id?: string | null
          last_journal_at?: string | null
          last_session_at?: string | null
          load_trend_7d_pct?: number | null
          longest_streak?: number | null
          mastery_scores?: Json
          matches_next_7d?: number | null
          mode_changed_at?: string | null
          notification_action_rate_7d?: number | null
          overall_percentile?: number | null
          pending_post_journal_count?: number | null
          pending_pre_journal_count?: number | null
          phv_offset_years?: number | null
          phv_stage?: string | null
          plan_compliance_7d?: number | null
          position?: string | null
          post_journal_completion_rate?: number | null
          pre_journal_completion_rate?: number | null
          program_compliance_rate?: number | null
          program_recommendations?: Json | null
          readiness_delta?: number | null
          readiness_distribution_7d?: Json | null
          readiness_rag?: string | null
          readiness_score?: number | null
          rec_action_rate_30d?: number | null
          recovery_score?: number | null
          resting_hr_bpm?: number | null
          resting_hr_trend_7d?: string | null
          season_phase?: string | null
          season_phase_week?: number | null
          sessions_scheduled_next_7d?: number | null
          sessions_total?: number
          sitting_height_cm?: number | null
          skin_temp_c?: number | null
          sleep_consistency_score?: number | null
          sleep_debt_3d?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sleep_recorded_at?: string | null
          sleep_trend_7d?: string | null
          snapshot_at?: string
          speed_profile?: Json
          spo2_pct?: number | null
          sport?: string | null
          streak_days?: number
          strength_benchmarks?: Json
          study_hours_7d?: number | null
          study_training_balance_ratio?: number | null
          target_achievement_rate_30d?: number | null
          tomo_intelligence_score?: number | null
          top_strengths?: Json | null
          total_points_7d?: number | null
          training_age_months?: number | null
          training_age_weeks?: number
          training_monotony?: number | null
          training_strain?: number | null
          triangle_engagement_score?: number | null
          triangle_rag?: string | null
          unresolved_concerns_count?: number | null
          wearable_connected?: boolean | null
          wearable_last_sync_at?: string | null
          weight_kg?: number | null
          wellness_7day_avg?: number | null
          wellness_trend?: string | null
        }
        Update: {
          academic_load_7day?: number | null
          academic_stress_latest?: number | null
          academic_stress_level?: number | null
          academic_stress_notes?: string | null
          academic_year?: number | null
          active_goals_count?: number | null
          active_injury_count?: number | null
          active_program_count?: number | null
          acwr?: number | null
          acwr_trend?: string | null
          adaptation_coefficient?: number | null
          applicable_protocol_ids?: string[] | null
          athlete_id?: string
          athlete_mode?: string | null
          athletic_load_7day?: number | null
          atl_7day?: number | null
          avg_drill_rating_30d?: number | null
          avg_post_body_feel_7d?: number | null
          body_feel_trend_7d?: number | null
          career_entry_count?: number | null
          ccrs?: number | null
          ccrs_alert_flags?: string[] | null
          ccrs_confidence?: string | null
          ccrs_recommendation?: string | null
          chat_messages_7d?: number | null
          chat_sessions_7d?: number | null
          checkin_consistency_7d?: number | null
          coachability_adaptation?: number | null
          coachability_index?: number | null
          coachability_responsiveness?: number | null
          coachability_target_rate?: number | null
          coaching_preference?: string | null
          ctl_28day?: number | null
          cv_completeness?: number | null
          cv_completeness_club_pct?: number | null
          cv_completeness_uni_pct?: number | null
          cv_sections_complete?: Json | null
          cv_statement_status?: string | null
          cv_views_7d?: number | null
          cv_views_total?: number | null
          data_confidence_breakdown?: Json | null
          data_confidence_score?: number | null
          data_freshness?: string | null
          days_since_coach_interaction?: number | null
          days_since_injury?: number | null
          days_since_last_session?: number | null
          days_since_parent_interaction?: number | null
          dob?: string | null
          drills_completed_7d?: number | null
          dual_load_index?: number | null
          dual_load_zone?: string | null
          exam_count_active?: number | null
          exam_period_training_rate?: number | null
          exam_proximity_score?: number | null
          exams_next_14d?: number | null
          height_cm?: number | null
          hrv_baseline_ms?: number | null
          hrv_recorded_at?: string | null
          hrv_sample_n?: number | null
          hrv_sd_30d?: number | null
          hrv_today_ms?: number | null
          hrv_trend_7d_pct?: number | null
          in_exam_period?: boolean | null
          injury_locations?: Json | null
          injury_risk_flag?: string | null
          journal_completeness_7d?: number | null
          journal_streak_days?: number | null
          key_gaps?: Json | null
          last_chat_at?: string | null
          last_checkin_at?: string | null
          last_event_id?: string | null
          last_journal_at?: string | null
          last_session_at?: string | null
          load_trend_7d_pct?: number | null
          longest_streak?: number | null
          mastery_scores?: Json
          matches_next_7d?: number | null
          mode_changed_at?: string | null
          notification_action_rate_7d?: number | null
          overall_percentile?: number | null
          pending_post_journal_count?: number | null
          pending_pre_journal_count?: number | null
          phv_offset_years?: number | null
          phv_stage?: string | null
          plan_compliance_7d?: number | null
          position?: string | null
          post_journal_completion_rate?: number | null
          pre_journal_completion_rate?: number | null
          program_compliance_rate?: number | null
          program_recommendations?: Json | null
          readiness_delta?: number | null
          readiness_distribution_7d?: Json | null
          readiness_rag?: string | null
          readiness_score?: number | null
          rec_action_rate_30d?: number | null
          recovery_score?: number | null
          resting_hr_bpm?: number | null
          resting_hr_trend_7d?: string | null
          season_phase?: string | null
          season_phase_week?: number | null
          sessions_scheduled_next_7d?: number | null
          sessions_total?: number
          sitting_height_cm?: number | null
          skin_temp_c?: number | null
          sleep_consistency_score?: number | null
          sleep_debt_3d?: number | null
          sleep_hours?: number | null
          sleep_quality?: number | null
          sleep_recorded_at?: string | null
          sleep_trend_7d?: string | null
          snapshot_at?: string
          speed_profile?: Json
          spo2_pct?: number | null
          sport?: string | null
          streak_days?: number
          strength_benchmarks?: Json
          study_hours_7d?: number | null
          study_training_balance_ratio?: number | null
          target_achievement_rate_30d?: number | null
          tomo_intelligence_score?: number | null
          top_strengths?: Json | null
          total_points_7d?: number | null
          training_age_months?: number | null
          training_age_weeks?: number
          training_monotony?: number | null
          training_strain?: number | null
          triangle_engagement_score?: number | null
          triangle_rag?: string | null
          unresolved_concerns_count?: number | null
          wearable_connected?: boolean | null
          wearable_last_sync_at?: string | null
          weight_kg?: number | null
          wellness_7day_avg?: number | null
          wellness_trend?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_snapshots_last_event_id_fkey"
            columns: ["last_event_id"]
            isOneToOne: false
            referencedRelation: "athlete_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      athlete_subjects: {
        Row: {
          athlete_id: string
          created_at: string | null
          difficulty_rating: number | null
          exam_date: string | null
          id: string
          is_active: boolean | null
          study_hours_per_week: number | null
          subject_name: string
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          difficulty_rating?: number | null
          exam_date?: string | null
          id?: string
          is_active?: boolean | null
          study_hours_per_week?: number | null
          subject_name: string
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          difficulty_rating?: number | null
          exam_date?: string | null
          id?: string
          is_active?: boolean | null
          study_hours_per_week?: number | null
          subject_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_subjects_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_week_plans: {
        Row: {
          calendar_event_ids: string[]
          compliance_rate: number | null
          created_at: string
          generated_at: string
          id: string
          inputs: Json
          outcome: Json | null
          plan_items: Json
          status: string
          summary: Json
          user_id: string
          week_start: string
        }
        Insert: {
          calendar_event_ids?: string[]
          compliance_rate?: number | null
          created_at?: string
          generated_at?: string
          id?: string
          inputs: Json
          outcome?: Json | null
          plan_items: Json
          status?: string
          summary: Json
          user_id: string
          week_start: string
        }
        Update: {
          calendar_event_ids?: string[]
          compliance_rate?: number | null
          created_at?: string
          generated_at?: string
          id?: string
          inputs?: Json
          outcome?: Json | null
          plan_items?: Json
          status?: string
          summary?: Json
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_week_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_weekly_digest: {
        Row: {
          amber_days: number | null
          athlete_id: string
          avg_energy: number | null
          avg_hrv_ms: number | null
          avg_mood: number | null
          avg_resting_hr: number | null
          avg_sleep_hours: number | null
          avg_soreness: number | null
          computed_at: string | null
          green_days: number | null
          hrv_trend_pct: number | null
          iso_week: number
          iso_year: number
          journal_completion_rate: number | null
          load_trend_pct: number | null
          red_days: number | null
          session_count: number | null
          total_academic_load_au: number | null
          total_training_load_au: number | null
          wellness_trend: string | null
        }
        Insert: {
          amber_days?: number | null
          athlete_id: string
          avg_energy?: number | null
          avg_hrv_ms?: number | null
          avg_mood?: number | null
          avg_resting_hr?: number | null
          avg_sleep_hours?: number | null
          avg_soreness?: number | null
          computed_at?: string | null
          green_days?: number | null
          hrv_trend_pct?: number | null
          iso_week: number
          iso_year: number
          journal_completion_rate?: number | null
          load_trend_pct?: number | null
          red_days?: number | null
          session_count?: number | null
          total_academic_load_au?: number | null
          total_training_load_au?: number | null
          wellness_trend?: string | null
        }
        Update: {
          amber_days?: number | null
          athlete_id?: string
          avg_energy?: number | null
          avg_hrv_ms?: number | null
          avg_mood?: number | null
          avg_resting_hr?: number | null
          avg_sleep_hours?: number | null
          avg_soreness?: number | null
          computed_at?: string | null
          green_days?: number | null
          hrv_trend_pct?: number | null
          iso_week?: number
          iso_year?: number
          journal_completion_rate?: number | null
          load_trend_pct?: number | null
          red_days?: number | null
          session_count?: number | null
          total_academic_load_au?: number | null
          total_training_load_au?: number | null
          wellness_trend?: string | null
        }
        Relationships: []
      }
      auto_repair_patterns: {
        Row: {
          affected_files: string[] | null
          created_at: string
          description: string | null
          detection_spec: Json
          id: string
          last_triggered_at: string | null
          patch_spec: Json
          pattern_name: string
          status: string
          success_rate: number | null
          times_merged: number
          times_triggered: number
          updated_at: string
        }
        Insert: {
          affected_files?: string[] | null
          created_at?: string
          description?: string | null
          detection_spec: Json
          id?: string
          last_triggered_at?: string | null
          patch_spec: Json
          pattern_name: string
          status?: string
          success_rate?: number | null
          times_merged?: number
          times_triggered?: number
          updated_at?: string
        }
        Update: {
          affected_files?: string[] | null
          created_at?: string
          description?: string | null
          detection_spec?: Json
          id?: string
          last_triggered_at?: string | null
          patch_spec?: Json
          pattern_name?: string
          status?: string
          success_rate?: number | null
          times_merged?: number
          times_triggered?: number
          updated_at?: string
        }
        Relationships: []
      }
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
          completed: boolean
          completed_at: string | null
          created_at: string
          end_at: string | null
          estimated_load_au: number | null
          event_type: string
          id: string
          intensity: string | null
          linked_programs: Json | null
          notes: string | null
          program_id: string | null
          session_plan: Json | null
          sport: string | null
          start_at: string
          title: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          end_at?: string | null
          estimated_load_au?: number | null
          event_type: string
          id?: string
          intensity?: string | null
          linked_programs?: Json | null
          notes?: string | null
          program_id?: string | null
          session_plan?: Json | null
          sport?: string | null
          start_at: string
          title: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          end_at?: string | null
          estimated_load_au?: number | null
          event_type?: string
          id?: string
          intensity?: string | null
          linked_programs?: Json | null
          notes?: string | null
          program_id?: string | null
          session_plan?: Json | null
          sport?: string | null
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
      ccrs_scores: {
        Row: {
          acwr_multiplier: number | null
          acwr_value: number | null
          alert_flags: string[] | null
          athlete_id: string
          bio_data_age_hours: number | null
          biometric_score: number | null
          ccrs: number
          computed_at: string
          confidence: string
          freshness_mult: number | null
          historical_score: number | null
          hooper_score: number | null
          id: string
          phv_multiplier: number | null
          recommendation: string
          session_date: string
          weight_biometric: number | null
          weight_coach: number | null
          weight_historical: number | null
          weight_hooper: number | null
        }
        Insert: {
          acwr_multiplier?: number | null
          acwr_value?: number | null
          alert_flags?: string[] | null
          athlete_id: string
          bio_data_age_hours?: number | null
          biometric_score?: number | null
          ccrs: number
          computed_at?: string
          confidence: string
          freshness_mult?: number | null
          historical_score?: number | null
          hooper_score?: number | null
          id?: string
          phv_multiplier?: number | null
          recommendation: string
          session_date?: string
          weight_biometric?: number | null
          weight_coach?: number | null
          weight_historical?: number | null
          weight_hooper?: number | null
        }
        Update: {
          acwr_multiplier?: number | null
          acwr_value?: number | null
          alert_flags?: string[] | null
          athlete_id?: string
          bio_data_age_hours?: number | null
          biometric_score?: number | null
          ccrs?: number
          computed_at?: string
          confidence?: string
          freshness_mult?: number | null
          historical_score?: number | null
          hooper_score?: number | null
          id?: string
          phv_multiplier?: number | null
          recommendation?: string
          session_date?: string
          weight_biometric?: number | null
          weight_coach?: number | null
          weight_historical?: number | null
          weight_hooper?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ccrs_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_logs: {
        Row: {
          blocked: boolean | null
          blocked_category: string | null
          created_at: string | null
          id: string
          topic_category: string | null
          user_id: string | null
        }
        Insert: {
          blocked?: boolean | null
          blocked_category?: string | null
          created_at?: string | null
          id?: string
          topic_category?: string | null
          user_id?: string | null
        }
        Update: {
          blocked?: boolean | null
          blocked_category?: string | null
          created_at?: string | null
          id?: string
          topic_category?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          agent: string | null
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string | null
          structured: Json | null
          token_count: number | null
          user_id: string
        }
        Insert: {
          agent?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          session_id?: string | null
          structured?: Json | null
          token_count?: number | null
          user_id: string
        }
        Update: {
          agent?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string | null
          structured?: Json | null
          token_count?: number | null
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
      chat_quality_scores: {
        Row: {
          a_actionability: number | null
          a_age_fit: number | null
          a_answer_quality: number | null
          a_conversational: number | null
          a_cost_usd: number | null
          a_empathy: number | null
          a_faithfulness: number | null
          a_latency_ms: number | null
          a_model: string | null
          a_personalization: number | null
          a_tone: number | null
          action_triggered: boolean
          age_band: string | null
          agent: string | null
          assistant_response_snippet: string | null
          b_actionability: number | null
          b_age_fit: number | null
          b_answer_quality: number | null
          b_conversational: number | null
          b_cost_usd: number | null
          b_empathy: number | null
          b_faithfulness: number | null
          b_latency_ms: number | null
          b_model: string | null
          b_personalization: number | null
          b_tone: number | null
          c_actionability: number | null
          c_age_fit: number | null
          c_answer_quality: number | null
          c_conversational: number | null
          c_empathy: number | null
          c_faithfulness: number | null
          c_personalization: number | null
          c_tone: number | null
          created_at: string
          disagreement_max: number | null
          empathy_triggered: boolean
          fb_computed_at: string | null
          fb_followup_clarify: boolean | null
          fb_regen_requested: boolean | null
          fb_repeat_intent: boolean | null
          fb_session_abandoned: boolean | null
          has_rag: boolean | null
          id: string
          needs_human_review: boolean
          sampling_stratum: string
          session_id: string | null
          sport: string | null
          total_judge_cost_usd: number | null
          trace_id: string
          turn_id: string
          user_id: string | null
          user_message_snippet: string | null
        }
        Insert: {
          a_actionability?: number | null
          a_age_fit?: number | null
          a_answer_quality?: number | null
          a_conversational?: number | null
          a_cost_usd?: number | null
          a_empathy?: number | null
          a_faithfulness?: number | null
          a_latency_ms?: number | null
          a_model?: string | null
          a_personalization?: number | null
          a_tone?: number | null
          action_triggered?: boolean
          age_band?: string | null
          agent?: string | null
          assistant_response_snippet?: string | null
          b_actionability?: number | null
          b_age_fit?: number | null
          b_answer_quality?: number | null
          b_conversational?: number | null
          b_cost_usd?: number | null
          b_empathy?: number | null
          b_faithfulness?: number | null
          b_latency_ms?: number | null
          b_model?: string | null
          b_personalization?: number | null
          b_tone?: number | null
          c_actionability?: number | null
          c_age_fit?: number | null
          c_answer_quality?: number | null
          c_conversational?: number | null
          c_empathy?: number | null
          c_faithfulness?: number | null
          c_personalization?: number | null
          c_tone?: number | null
          created_at?: string
          disagreement_max?: number | null
          empathy_triggered?: boolean
          fb_computed_at?: string | null
          fb_followup_clarify?: boolean | null
          fb_regen_requested?: boolean | null
          fb_repeat_intent?: boolean | null
          fb_session_abandoned?: boolean | null
          has_rag?: boolean | null
          id?: string
          needs_human_review?: boolean
          sampling_stratum: string
          session_id?: string | null
          sport?: string | null
          total_judge_cost_usd?: number | null
          trace_id: string
          turn_id: string
          user_id?: string | null
          user_message_snippet?: string | null
        }
        Update: {
          a_actionability?: number | null
          a_age_fit?: number | null
          a_answer_quality?: number | null
          a_conversational?: number | null
          a_cost_usd?: number | null
          a_empathy?: number | null
          a_faithfulness?: number | null
          a_latency_ms?: number | null
          a_model?: string | null
          a_personalization?: number | null
          a_tone?: number | null
          action_triggered?: boolean
          age_band?: string | null
          agent?: string | null
          assistant_response_snippet?: string | null
          b_actionability?: number | null
          b_age_fit?: number | null
          b_answer_quality?: number | null
          b_conversational?: number | null
          b_cost_usd?: number | null
          b_empathy?: number | null
          b_faithfulness?: number | null
          b_latency_ms?: number | null
          b_model?: string | null
          b_personalization?: number | null
          b_tone?: number | null
          c_actionability?: number | null
          c_age_fit?: number | null
          c_answer_quality?: number | null
          c_conversational?: number | null
          c_empathy?: number | null
          c_faithfulness?: number | null
          c_personalization?: number | null
          c_tone?: number | null
          created_at?: string
          disagreement_max?: number | null
          empathy_triggered?: boolean
          fb_computed_at?: string | null
          fb_followup_clarify?: boolean | null
          fb_regen_requested?: boolean | null
          fb_repeat_intent?: boolean | null
          fb_session_abandoned?: boolean | null
          has_rag?: boolean | null
          id?: string
          needs_human_review?: boolean
          sampling_stratum?: string
          session_id?: string | null
          sport?: string | null
          total_judge_cost_usd?: number | null
          trace_id?: string
          turn_id?: string
          user_id?: string | null
          user_message_snippet?: string | null
        }
        Relationships: []
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
      chat_sessions: {
        Row: {
          active_agent: string | null
          conversation_state: Json | null
          conversation_summary: string | null
          created_at: string | null
          ended_at: string | null
          id: string
          pending_action: Json | null
          pending_action_expires_at: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_agent?: string | null
          conversation_state?: Json | null
          conversation_summary?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          pending_action?: Json | null
          pending_action_expires_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_agent?: string | null
          conversation_state?: Json | null
          conversation_summary?: string | null
          created_at?: string | null
          ended_at?: string | null
          id?: string
          pending_action?: Json | null
          pending_action_expires_at?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      cms_knowledge_inheritance: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          knowledge_id: string
          knowledge_type: string
          override_data: Json | null
          override_type: Database["public"]["Enums"]["knowledge_override_type"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          knowledge_id: string
          knowledge_type: string
          override_data?: Json | null
          override_type?: Database["public"]["Enums"]["knowledge_override_type"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          knowledge_id?: string
          knowledge_type?: string
          override_data?: Json | null
          override_type?: Database["public"]["Enums"]["knowledge_override_type"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_knowledge_inheritance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_tenants: {
        Row: {
          branding: Json
          config: Json
          contact_email: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          max_athletes: number | null
          max_coaches: number | null
          max_knowledge_chunks: number | null
          name: string
          parent_id: string | null
          slug: string
          subscription_tier: string | null
          tier: Database["public"]["Enums"]["tenant_tier"]
          timezone: string | null
          updated_at: string
        }
        Insert: {
          branding?: Json
          config?: Json
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_athletes?: number | null
          max_coaches?: number | null
          max_knowledge_chunks?: number | null
          name: string
          parent_id?: string | null
          slug: string
          subscription_tier?: string | null
          tier?: Database["public"]["Enums"]["tenant_tier"]
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          branding?: Json
          config?: Json
          contact_email?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_athletes?: number | null
          max_coaches?: number | null
          max_knowledge_chunks?: number | null
          name?: string
          parent_id?: string | null
          slug?: string
          subscription_tier?: string | null
          tier?: Database["public"]["Enums"]["tenant_tier"]
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_tenants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_programmes: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          season_cycle: string | null
          start_date: string
          status: string | null
          target_player_ids: string[] | null
          target_positions: string[] | null
          target_type: string | null
          updated_at: string | null
          weeks: number
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          season_cycle?: string | null
          start_date: string
          status?: string | null
          target_player_ids?: string[] | null
          target_positions?: string[] | null
          target_type?: string | null
          updated_at?: string | null
          weeks?: number
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          season_cycle?: string | null
          start_date?: string
          status?: string | null
          target_player_ids?: string[] | null
          target_positions?: string[] | null
          target_type?: string | null
          updated_at?: string | null
          weeks?: number
        }
        Relationships: []
      }
      cognitive_windows: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          enabled: boolean
          id: string
          label: string
          optimal_delay_minutes: number
          window_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          enabled?: boolean
          id?: string
          label: string
          optimal_delay_minutes: number
          window_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          enabled?: boolean
          id?: string
          label?: string
          optimal_delay_minutes?: number
          window_type?: string
        }
        Relationships: []
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
      conversation_plans: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          plan_data: Json
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          plan_data?: Json
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          plan_data?: Json
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cv_academic_entries: {
        Row: {
          athlete_id: string
          country: string | null
          created_at: string | null
          gpa: string | null
          gpa_scale: string | null
          honours: string[] | null
          id: string
          institution: string
          is_current: boolean | null
          ncaa_eligibility_id: string | null
          predicted_grade: string | null
          qualification: string | null
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          athlete_id: string
          country?: string | null
          created_at?: string | null
          gpa?: string | null
          gpa_scale?: string | null
          honours?: string[] | null
          id?: string
          institution: string
          is_current?: boolean | null
          ncaa_eligibility_id?: string | null
          predicted_grade?: string | null
          qualification?: string | null
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          athlete_id?: string
          country?: string | null
          created_at?: string | null
          gpa?: string | null
          gpa_scale?: string | null
          honours?: string[] | null
          id?: string
          institution?: string
          is_current?: boolean | null
          ncaa_eligibility_id?: string | null
          predicted_grade?: string | null
          qualification?: string | null
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_academic_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_career_entries: {
        Row: {
          achievements: string[] | null
          appearances: number | null
          assists: number | null
          athlete_id: string
          clean_sheets: number | null
          club_name: string
          country: string | null
          created_at: string | null
          display_order: number | null
          ended_month: string | null
          entry_type: string
          goals: number | null
          id: string
          injury_note: string | null
          is_current: boolean | null
          league_level: string | null
          position: string | null
          started_month: string | null
          updated_at: string | null
        }
        Insert: {
          achievements?: string[] | null
          appearances?: number | null
          assists?: number | null
          athlete_id: string
          clean_sheets?: number | null
          club_name: string
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          ended_month?: string | null
          entry_type: string
          goals?: number | null
          id?: string
          injury_note?: string | null
          is_current?: boolean | null
          league_level?: string | null
          position?: string | null
          started_month?: string | null
          updated_at?: string | null
        }
        Update: {
          achievements?: string[] | null
          appearances?: number | null
          assists?: number | null
          athlete_id?: string
          clean_sheets?: number | null
          club_name?: string
          country?: string | null
          created_at?: string | null
          display_order?: number | null
          ended_month?: string | null
          entry_type?: string
          goals?: number | null
          id?: string
          injury_note?: string | null
          is_current?: boolean | null
          league_level?: string | null
          position?: string | null
          started_month?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_career_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_character_traits: {
        Row: {
          athlete_id: string
          date: string | null
          description: string | null
          display_order: number | null
          id: string
          level: string | null
          title: string
          trait_category: string
        }
        Insert: {
          athlete_id: string
          date?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          level?: string | null
          title: string
          trait_category: string
        }
        Update: {
          athlete_id?: string
          date?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          level?: string | null
          title?: string
          trait_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_character_traits_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_media_links: {
        Row: {
          athlete_id: string
          created_at: string | null
          display_order: number | null
          id: string
          is_primary: boolean | null
          media_type: string
          platform: string | null
          title: string | null
          url: string
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type: string
          platform?: string | null
          title?: string | null
          url: string
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type?: string
          platform?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_media_links_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_profiles: {
        Row: {
          athlete_id: string
          completeness_club_pct: number | null
          completeness_uni_pct: number | null
          created_at: string | null
          cv_club_discoverable: boolean | null
          cv_uni_discoverable: boolean | null
          dominant_zone: string | null
          dual_role_last_generated: string | null
          dual_role_narrative: string | null
          formation_preference: string | null
          last_club_export_at: string | null
          last_uni_export_at: string | null
          personal_statement_club: string | null
          personal_statement_uni: string | null
          share_club_views: number | null
          share_token_club: string | null
          share_token_uni: string | null
          share_uni_views: number | null
          show_coachability: boolean | null
          show_load_data: boolean | null
          show_performance_data: boolean | null
          statement_data_snapshot: Json | null
          statement_last_generated: string | null
          statement_status: string | null
          trajectory_last_generated: string | null
          trajectory_narrative: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id: string
          completeness_club_pct?: number | null
          completeness_uni_pct?: number | null
          created_at?: string | null
          cv_club_discoverable?: boolean | null
          cv_uni_discoverable?: boolean | null
          dominant_zone?: string | null
          dual_role_last_generated?: string | null
          dual_role_narrative?: string | null
          formation_preference?: string | null
          last_club_export_at?: string | null
          last_uni_export_at?: string | null
          personal_statement_club?: string | null
          personal_statement_uni?: string | null
          share_club_views?: number | null
          share_token_club?: string | null
          share_token_uni?: string | null
          share_uni_views?: number | null
          show_coachability?: boolean | null
          show_load_data?: boolean | null
          show_performance_data?: boolean | null
          statement_data_snapshot?: Json | null
          statement_last_generated?: string | null
          statement_status?: string | null
          trajectory_last_generated?: string | null
          trajectory_narrative?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: string
          completeness_club_pct?: number | null
          completeness_uni_pct?: number | null
          created_at?: string | null
          cv_club_discoverable?: boolean | null
          cv_uni_discoverable?: boolean | null
          dominant_zone?: string | null
          dual_role_last_generated?: string | null
          dual_role_narrative?: string | null
          formation_preference?: string | null
          last_club_export_at?: string | null
          last_uni_export_at?: string | null
          personal_statement_club?: string | null
          personal_statement_uni?: string | null
          share_club_views?: number | null
          share_token_club?: string | null
          share_token_uni?: string | null
          share_uni_views?: number | null
          show_coachability?: boolean | null
          show_load_data?: boolean | null
          show_performance_data?: boolean | null
          statement_data_snapshot?: Json | null
          statement_last_generated?: string | null
          statement_status?: string | null
          trajectory_last_generated?: string | null
          trajectory_narrative?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_profiles_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_references: {
        Row: {
          athlete_id: string
          club_institution: string
          consent_given: boolean | null
          created_at: string | null
          display_order: number | null
          email: string | null
          id: string
          phone: string | null
          referee_name: string
          referee_role: string
          relationship: string | null
        }
        Insert: {
          athlete_id: string
          club_institution: string
          consent_given?: boolean | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          phone?: string | null
          referee_name: string
          referee_role: string
          relationship?: string | null
        }
        Update: {
          athlete_id?: string
          club_institution?: string
          consent_given?: boolean | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          phone?: string | null
          referee_name?: string
          referee_role?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_references_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_share_views: {
        Row: {
          athlete_id: string
          cv_type: string
          id: string
          share_token: string
          viewed_at: string | null
          viewer_ip: string | null
          viewer_ua: string | null
        }
        Insert: {
          athlete_id: string
          cv_type: string
          id?: string
          share_token: string
          viewed_at?: string | null
          viewer_ip?: string | null
          viewer_ua?: string | null
        }
        Update: {
          athlete_id?: string
          cv_type?: string
          id?: string
          share_token?: string
          viewed_at?: string | null
          viewer_ip?: string | null
          viewer_ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_share_views_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sections: {
        Row: {
          coaching_text: string | null
          component_type: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          section_key: string
          sort_order: number
          sport_filter: string[] | null
          updated_at: string
          updated_by: string | null
          visibility: Json | null
        }
        Insert: {
          coaching_text?: string | null
          component_type: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          section_key: string
          sort_order?: number
          sport_filter?: string[] | null
          updated_at?: string
          updated_by?: string | null
          visibility?: Json | null
        }
        Update: {
          coaching_text?: string | null
          component_type?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          section_key?: string
          sort_order?: number
          sport_filter?: string[] | null
          updated_at?: string
          updated_by?: string | null
          visibility?: Json | null
        }
        Relationships: []
      }
      day_locks: {
        Row: {
          date: string
          id: string
          locked_at: string
          user_id: string
        }
        Insert: {
          date: string
          id?: string
          locked_at?: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          locked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_collection: {
        Row: {
          created_at: string
          description: string
          distance_function: string
          document_count: number | null
          document_embedded_count: number | null
          embedding_dimensions: number
          embedding_model_name: string
          index_type: string
          is_auto_embedded: boolean
          is_indexed: boolean
          is_normalized: boolean
          list_count: number
          metadata: Json | null
          name: string
          probe_count: number
          table_name: string
          updated_at: string | null
          uuid: string
        }
        Insert: {
          created_at?: string
          description: string
          distance_function: string
          document_count?: number | null
          document_embedded_count?: number | null
          embedding_dimensions: number
          embedding_model_name: string
          index_type: string
          is_auto_embedded: boolean
          is_indexed: boolean
          is_normalized: boolean
          list_count: number
          metadata?: Json | null
          name: string
          probe_count: number
          table_name: string
          updated_at?: string | null
          uuid?: string
        }
        Update: {
          created_at?: string
          description?: string
          distance_function?: string
          document_count?: number | null
          document_embedded_count?: number | null
          embedding_dimensions?: number
          embedding_model_name?: string
          index_type?: string
          is_auto_embedded?: boolean
          is_indexed?: boolean
          is_normalized?: boolean
          list_count?: number
          metadata?: Json | null
          name?: string
          probe_count?: number
          table_name?: string
          updated_at?: string | null
          uuid?: string
        }
        Relationships: []
      }
      drill_equipment: {
        Row: {
          drill_id: string
          id: string
          name: string
          optional: boolean
          quantity: number
        }
        Insert: {
          drill_id: string
          id?: string
          name: string
          optional?: boolean
          quantity?: number
        }
        Update: {
          drill_id?: string
          id?: string
          name?: string
          optional?: boolean
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "drill_equipment_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_progressions: {
        Row: {
          description: string
          drill_id: string
          duration_minutes: number | null
          id: string
          label: string
          level: number
          sort_order: number
        }
        Insert: {
          description: string
          drill_id: string
          duration_minutes?: number | null
          id?: string
          label: string
          level: number
          sort_order?: number
        }
        Update: {
          description?: string
          drill_id?: string
          duration_minutes?: number | null
          id?: string
          label?: string
          level?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "drill_progressions_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_ratings: {
        Row: {
          completion_status: string
          created_at: string
          date: string
          difficulty: number | null
          drill_id: string
          effort: number | null
          id: string
          notes: string | null
          rating: number
          user_id: string
        }
        Insert: {
          completion_status?: string
          created_at?: string
          date?: string
          difficulty?: number | null
          drill_id: string
          effort?: number | null
          id?: string
          notes?: string | null
          rating: number
          user_id: string
        }
        Update: {
          completion_status?: string
          created_at?: string
          date?: string
          difficulty?: number | null
          drill_id?: string
          effort?: number | null
          id?: string
          notes?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_ratings_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      drill_tags: {
        Row: {
          drill_id: string
          id: string
          tag: string
        }
        Insert: {
          drill_id: string
          id?: string
          tag: string
        }
        Update: {
          drill_id?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "drill_tags_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      dual_load_thresholds: {
        Row: {
          created_at: string | null
          description: string | null
          dli_max: number
          dli_min: number
          id: string
          recommended_actions: Json | null
          sort_order: number | null
          updated_at: string | null
          zone: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          dli_max: number
          dli_min: number
          id: string
          recommended_actions?: Json | null
          sort_order?: number | null
          updated_at?: string | null
          zone: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          dli_max?: number
          dli_min?: number
          id?: string
          recommended_actions?: Json | null
          sort_order?: number | null
          updated_at?: string | null
          zone?: string
        }
        Relationships: []
      }
      event_linked_programs: {
        Row: {
          event_id: string
          id: string
          linked_at: string
          linked_by: string
          program_id: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          linked_at?: string
          linked_by?: string
          program_id: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          linked_at?: string
          linked_by?: string
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_linked_programs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_linked_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
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
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          flag_key: string
          id: string
          sports: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key: string
          id?: string
          sports?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          flag_key?: string
          id?: string
          sports?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      football_test_results: {
        Row: {
          age_mean: number | null
          age_mean_unit: string | null
          created_at: string | null
          date: string
          derived_metrics: Json | null
          id: string
          is_new_pb: boolean | null
          percentile: number | null
          percentile_label: string | null
          previous_best: number | null
          primary_label: string
          primary_unit: string
          primary_value: number
          raw_inputs: Json | null
          test_type: string
          user_id: string
        }
        Insert: {
          age_mean?: number | null
          age_mean_unit?: string | null
          created_at?: string | null
          date?: string
          derived_metrics?: Json | null
          id?: string
          is_new_pb?: boolean | null
          percentile?: number | null
          percentile_label?: string | null
          previous_best?: number | null
          primary_label?: string
          primary_unit?: string
          primary_value: number
          raw_inputs?: Json | null
          test_type: string
          user_id: string
        }
        Update: {
          age_mean?: number | null
          age_mean_unit?: string | null
          created_at?: string | null
          date?: string
          derived_metrics?: Json | null
          id?: string
          is_new_pb?: boolean | null
          percentile?: number | null
          percentile_label?: string | null
          previous_best?: number | null
          primary_label?: string
          primary_unit?: string
          primary_value?: number
          raw_inputs?: Json | null
          test_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "football_test_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      football_training_programs: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          difficulty: string | null
          duration_minutes: number | null
          equipment: string[] | null
          id: string
          name: string
          phv_guidance: Json | null
          position_emphasis: string[] | null
          prescriptions: Json
          session_structure: Json | null
          tags: string[] | null
          type: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          equipment?: string[] | null
          id: string
          name: string
          phv_guidance?: Json | null
          position_emphasis?: string[] | null
          prescriptions: Json
          session_structure?: Json | null
          tags?: string[] | null
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          equipment?: string[] | null
          id?: string
          name?: string
          phv_guidance?: Json | null
          position_emphasis?: string[] | null
          prescriptions?: Json
          session_structure?: Json | null
          tags?: string[] | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      golden_test_scenarios: {
        Row: {
          added_at: string
          consecutive_passes: number
          expected_agent: string | null
          expected_signals: Json
          id: string
          is_frozen: boolean
          last_passing_score: number | null
          scenario_key: string
          scheduled_removal_at: string | null
          source: string
          suite: string
          updated_at: string
          user_message: string
        }
        Insert: {
          added_at?: string
          consecutive_passes?: number
          expected_agent?: string | null
          expected_signals?: Json
          id?: string
          is_frozen?: boolean
          last_passing_score?: number | null
          scenario_key: string
          scheduled_removal_at?: string | null
          source: string
          suite: string
          updated_at?: string
          user_message: string
        }
        Update: {
          added_at?: string
          consecutive_passes?: number
          expected_agent?: string | null
          expected_signals?: Json
          id?: string
          is_frozen?: boolean
          last_passing_score?: number | null
          scenario_key?: string
          scheduled_removal_at?: string | null
          source?: string
          suite?: string
          updated_at?: string
          user_message?: string
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
      invite_codes: {
        Row: {
          code: string
          created_at: string
          creator_id: string
          expires_at: string
          target_role: string
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          creator_id: string
          expires_at: string
          target_role: string
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          creator_id?: string
          expires_at?: string
          target_role?: string
          used_by?: string | null
        }
        Relationships: []
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
      knowledge_entities: {
        Row: {
          created_at: string
          description: string
          display_name: string
          embedding: string | null
          entity_type: string
          id: string
          institution_id: string | null
          name: string
          properties: Json
          search_vector: unknown
          source_chunk_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          display_name: string
          embedding?: string | null
          entity_type: string
          id?: string
          institution_id?: string | null
          name: string
          properties?: Json
          search_vector?: unknown
          source_chunk_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_name?: string
          embedding?: string | null
          entity_type?: string
          id?: string
          institution_id?: string | null
          name?: string
          properties?: Json
          search_vector?: unknown
          source_chunk_ids?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entities_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_relationships: {
        Row: {
          created_at: string
          id: string
          institution_id: string | null
          properties: Json
          relation_type: string
          source_chunk_ids: string[] | null
          source_entity_id: string
          target_entity_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          institution_id?: string | null
          properties?: Json
          relation_type: string
          source_chunk_ids?: string[] | null
          source_entity_id: string
          target_entity_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          institution_id?: string | null
          properties?: Json
          relation_type?: string
          source_chunk_ids?: string[] | null
          source_entity_id?: string
          target_entity_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_relationships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_relationships_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_relationships_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entities"
            referencedColumns: ["id"]
          },
        ]
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
      notification_dismissal_log: {
        Row: {
          athlete_id: string
          dismissed_at: string
          id: string
          notification_type: string
        }
        Insert: {
          athlete_id: string
          dismissed_at?: string
          id?: string
          notification_type: string
        }
        Update: {
          athlete_id?: string
          dismissed_at?: string
          id?: string
          notification_type?: string
        }
        Relationships: []
      }
      notification_template_overrides: {
        Row: {
          body: string | null
          enabled: boolean | null
          notification_type: string
          priority: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          enabled?: boolean | null
          notification_type: string
          priority?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          enabled?: boolean | null
          notification_type?: string
          priority?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_type_config: {
        Row: {
          enabled: boolean | null
          notes: string | null
          notification_type: string
          priority_override: number | null
          push_enabled: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean | null
          notes?: string | null
          notification_type: string
          priority_override?: number | null
          push_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean | null
          notes?: string | null
          notification_type?: string
          priority_override?: number | null
          push_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_data: Json | null
          action_label: string | null
          body: string | null
          created_at: string
          data: Json | null
          expires_at: string | null
          id: string
          is_acted: boolean | null
          read: boolean
          source_id: string | null
          source_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_data?: Json | null
          action_label?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_acted?: boolean | null
          read?: boolean
          source_id?: string | null
          source_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_data?: Json | null
          action_label?: string | null
          body?: string | null
          created_at?: string
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_acted?: boolean | null
          read?: boolean
          source_id?: string | null
          source_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          joined_at: string
          permissions: Json
          role: Database["public"]["Enums"]["org_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["org_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          joined_at?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["org_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
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
      padel_shot_results: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          overall: number
          session_type: string
          shot_type: string
          sub_metrics: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          overall?: number
          session_type?: string
          shot_type: string
          sub_metrics?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          overall?: number
          session_type?: string
          shot_type?: string
          sub_metrics?: Json
          user_id?: string
        }
        Relationships: []
      }
      page_configs: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          metadata: Json
          screen_key: string
          screen_label: string
          sections: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          metadata?: Json
          screen_key: string
          screen_label: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          metadata?: Json
          screen_key?: string
          screen_label?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pd_program_rule_audit: {
        Row: {
          athlete_id: string
          audit_id: string
          categories_blocked: string[] | null
          categories_prioritized: string[] | null
          condition_values: Json
          programs_blocked: string[] | null
          programs_mandated: string[] | null
          rule_id: string
          source_trigger: string | null
          triggered_at: string | null
        }
        Insert: {
          athlete_id: string
          audit_id?: string
          categories_blocked?: string[] | null
          categories_prioritized?: string[] | null
          condition_values: Json
          programs_blocked?: string[] | null
          programs_mandated?: string[] | null
          rule_id: string
          source_trigger?: string | null
          triggered_at?: string | null
        }
        Update: {
          athlete_id?: string
          audit_id?: string
          categories_blocked?: string[] | null
          categories_prioritized?: string[] | null
          condition_values?: Json
          programs_blocked?: string[] | null
          programs_mandated?: string[] | null
          rule_id?: string
          source_trigger?: string | null
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pd_program_rule_audit_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pd_program_rules"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      pd_program_rules: {
        Row: {
          age_band_filter: string[] | null
          ai_guidance_text: string | null
          block_categories: string[] | null
          blocked_programs: string[] | null
          category: string
          conditions: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          evidence_grade: string | null
          evidence_source: string | null
          frequency_cap: number | null
          high_priority_programs: string[] | null
          intensity_cap: string | null
          is_built_in: boolean | null
          is_enabled: boolean | null
          load_multiplier: number | null
          mandatory_programs: string[] | null
          name: string
          phv_filter: string[] | null
          position_filter: string[] | null
          prioritize_categories: string[] | null
          priority: number
          rule_id: string
          safety_critical: boolean | null
          session_cap_minutes: number | null
          sport_filter: string[] | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          age_band_filter?: string[] | null
          ai_guidance_text?: string | null
          block_categories?: string[] | null
          blocked_programs?: string[] | null
          category: string
          conditions: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evidence_grade?: string | null
          evidence_source?: string | null
          frequency_cap?: number | null
          high_priority_programs?: string[] | null
          intensity_cap?: string | null
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          load_multiplier?: number | null
          mandatory_programs?: string[] | null
          name: string
          phv_filter?: string[] | null
          position_filter?: string[] | null
          prioritize_categories?: string[] | null
          priority?: number
          rule_id?: string
          safety_critical?: boolean | null
          session_cap_minutes?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          age_band_filter?: string[] | null
          ai_guidance_text?: string | null
          block_categories?: string[] | null
          blocked_programs?: string[] | null
          category?: string
          conditions?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evidence_grade?: string | null
          evidence_source?: string | null
          frequency_cap?: number | null
          high_priority_programs?: string[] | null
          intensity_cap?: string | null
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          load_multiplier?: number | null
          mandatory_programs?: string[] | null
          name?: string
          phv_filter?: string[] | null
          position_filter?: string[] | null
          prioritize_categories?: string[] | null
          priority?: number
          rule_id?: string
          safety_critical?: boolean | null
          session_cap_minutes?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: []
      }
      pd_protocol_audit: {
        Row: {
          athlete_id: string
          audit_id: string
          condition_values: Json
          context_applied: Json
          overridden_by: string | null
          protocol_id: string
          resolution_rank: number | null
          source_event_id: string | null
          source_trigger: string | null
          triggered_at: string | null
          was_overridden: boolean | null
        }
        Insert: {
          athlete_id: string
          audit_id?: string
          condition_values: Json
          context_applied: Json
          overridden_by?: string | null
          protocol_id: string
          resolution_rank?: number | null
          source_event_id?: string | null
          source_trigger?: string | null
          triggered_at?: string | null
          was_overridden?: boolean | null
        }
        Update: {
          athlete_id?: string
          audit_id?: string
          condition_values?: Json
          context_applied?: Json
          overridden_by?: string | null
          protocol_id?: string
          resolution_rank?: number | null
          source_event_id?: string | null
          source_trigger?: string | null
          triggered_at?: string | null
          was_overridden?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pd_protocol_audit_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "pd_protocols"
            referencedColumns: ["protocol_id"]
          },
        ]
      }
      pd_protocols: {
        Row: {
          age_band_filter: string[] | null
          ai_system_injection: string | null
          blocked_rag_domains: string[] | null
          blocked_rec_categories: string[] | null
          category: string
          conditions: Json
          contraindications: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          evidence_grade: string | null
          evidence_source: string | null
          forced_rag_domains: string[] | null
          institution_id: string | null
          intensity_cap: string | null
          is_built_in: boolean | null
          is_enabled: boolean | null
          load_multiplier: number | null
          mandatory_rec_categories: string[] | null
          name: string
          override_message: string | null
          phv_filter: string[] | null
          position_filter: string[] | null
          priority: number
          priority_override: string | null
          protocol_id: string
          rag_condition_tags: Json | null
          required_elements: string[] | null
          safety_critical: boolean | null
          session_cap_minutes: number | null
          sport_filter: string[] | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          age_band_filter?: string[] | null
          ai_system_injection?: string | null
          blocked_rag_domains?: string[] | null
          blocked_rec_categories?: string[] | null
          category: string
          conditions: Json
          contraindications?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evidence_grade?: string | null
          evidence_source?: string | null
          forced_rag_domains?: string[] | null
          institution_id?: string | null
          intensity_cap?: string | null
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          load_multiplier?: number | null
          mandatory_rec_categories?: string[] | null
          name: string
          override_message?: string | null
          phv_filter?: string[] | null
          position_filter?: string[] | null
          priority?: number
          priority_override?: string | null
          protocol_id?: string
          rag_condition_tags?: Json | null
          required_elements?: string[] | null
          safety_critical?: boolean | null
          session_cap_minutes?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          age_band_filter?: string[] | null
          ai_system_injection?: string | null
          blocked_rag_domains?: string[] | null
          blocked_rec_categories?: string[] | null
          category?: string
          conditions?: Json
          contraindications?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evidence_grade?: string | null
          evidence_source?: string | null
          forced_rag_domains?: string[] | null
          institution_id?: string | null
          intensity_cap?: string | null
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          load_multiplier?: number | null
          mandatory_rec_categories?: string[] | null
          name?: string
          override_message?: string | null
          phv_filter?: string[] | null
          position_filter?: string[] | null
          priority?: number
          priority_override?: string | null
          protocol_id?: string
          rag_condition_tags?: Json | null
          required_elements?: string[] | null
          safety_critical?: boolean | null
          session_cap_minutes?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pd_protocols_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pd_signals: {
        Row: {
          adapted_plan_meta: string | null
          adapted_plan_name: string | null
          arc_opacity: Json
          bar_rgba: string
          coaching_color: string
          coaching_text: string
          color: string
          conditions: Json
          created_at: string | null
          display_name: string
          hero_background: string
          is_built_in: boolean | null
          is_enabled: boolean | null
          key: string
          pill_background: string
          pill_config: Json
          priority: number
          show_urgency_badge: boolean | null
          signal_id: string
          subtitle: string
          trigger_config: Json
          updated_at: string | null
          urgency_label: string | null
        }
        Insert: {
          adapted_plan_meta?: string | null
          adapted_plan_name?: string | null
          arc_opacity: Json
          bar_rgba: string
          coaching_color: string
          coaching_text: string
          color: string
          conditions: Json
          created_at?: string | null
          display_name: string
          hero_background: string
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          key: string
          pill_background: string
          pill_config: Json
          priority: number
          show_urgency_badge?: boolean | null
          signal_id?: string
          subtitle: string
          trigger_config: Json
          updated_at?: string | null
          urgency_label?: string | null
        }
        Update: {
          adapted_plan_meta?: string | null
          adapted_plan_name?: string | null
          arc_opacity?: Json
          bar_rgba?: string
          coaching_color?: string
          coaching_text?: string
          color?: string
          conditions?: Json
          created_at?: string | null
          display_name?: string
          hero_background?: string
          is_built_in?: boolean | null
          is_enabled?: boolean | null
          key?: string
          pill_background?: string
          pill_config?: Json
          priority?: number
          show_urgency_badge?: boolean | null
          signal_id?: string
          subtitle?: string
          trigger_config?: Json
          updated_at?: string | null
          urgency_label?: string | null
        }
        Relationships: []
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
      phv_reference: {
        Row: {
          created_at: string | null
          equation_name: string
          female_coefficients: Json
          id: string
          male_coefficients: Json
          stage_definitions: Json
        }
        Insert: {
          created_at?: string | null
          equation_name: string
          female_coefficients: Json
          id?: string
          male_coefficients: Json
          stage_definitions: Json
        }
        Update: {
          created_at?: string | null
          equation_name?: string
          female_coefficients?: Json
          id?: string
          male_coefficients?: Json
          stage_definitions?: Json
        }
        Relationships: []
      }
      planning_protocols: {
        Row: {
          actions: Json
          category: string
          created_at: string | null
          description: string | null
          id: string
          institution_id: string | null
          is_enabled: boolean | null
          name: string
          scientific_basis: string | null
          severity: string
          sport_filter: string[] | null
          trigger_conditions: Json
          updated_at: string | null
          version: number | null
        }
        Insert: {
          actions?: Json
          category: string
          created_at?: string | null
          description?: string | null
          id: string
          institution_id?: string | null
          is_enabled?: boolean | null
          name: string
          scientific_basis?: string | null
          severity: string
          sport_filter?: string[] | null
          trigger_conditions?: Json
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          actions?: Json
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          institution_id?: string | null
          is_enabled?: boolean | null
          name?: string
          scientific_basis?: string | null
          severity?: string
          sport_filter?: string[] | null
          trigger_conditions?: Json
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_protocols_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_sessions: {
        Row: {
          athlete_id: string
          committed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          input_snapshot: Json | null
          mode_id: string | null
          output_plan: Json | null
          plan_type: string
          protocols_applied: string[] | null
          status: string | null
        }
        Insert: {
          athlete_id: string
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          input_snapshot?: Json | null
          mode_id?: string | null
          output_plan?: Json | null
          plan_type: string
          protocols_applied?: string[] | null
          status?: string | null
        }
        Update: {
          athlete_id?: string
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          input_snapshot?: Json | null
          mode_id?: string | null
          output_plan?: Json | null
          plan_type?: string
          protocols_applied?: string[] | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_sessions_mode_id_fkey"
            columns: ["mode_id"]
            isOneToOne: false
            referencedRelation: "athlete_modes"
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
      player_benchmark_snapshots: {
        Row: {
          age_band_used: string | null
          competition_lvl: string | null
          created_at: string | null
          id: string
          metric_key: string
          metric_label: string | null
          notes: string | null
          percentile: number | null
          position_used: string | null
          source: string | null
          tested_at: string
          user_id: string | null
          value: number
          zone: string | null
        }
        Insert: {
          age_band_used?: string | null
          competition_lvl?: string | null
          created_at?: string | null
          id?: string
          metric_key: string
          metric_label?: string | null
          notes?: string | null
          percentile?: number | null
          position_used?: string | null
          source?: string | null
          tested_at?: string
          user_id?: string | null
          value: number
          zone?: string | null
        }
        Update: {
          age_band_used?: string | null
          competition_lvl?: string | null
          created_at?: string | null
          id?: string
          metric_key?: string
          metric_label?: string | null
          notes?: string | null
          percentile?: number | null
          position_used?: string | null
          source?: string | null
          tested_at?: string
          user_id?: string | null
          value?: number
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_benchmark_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_club_history: {
        Row: {
          achievements: string[] | null
          athlete_id: string
          club_name: string
          created_at: string | null
          end_year: number | null
          id: string
          notes: string | null
          role: string | null
          sort_order: number | null
          start_year: number
          updated_at: string | null
        }
        Insert: {
          achievements?: string[] | null
          athlete_id: string
          club_name: string
          created_at?: string | null
          end_year?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          sort_order?: number | null
          start_year: number
          updated_at?: string | null
        }
        Update: {
          achievements?: string[] | null
          athlete_id?: string
          club_name?: string
          created_at?: string | null
          end_year?: number | null
          id?: string
          notes?: string | null
          role?: string | null
          sort_order?: number | null
          start_year?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      player_phv_assessments: {
        Row: {
          age_decimal: number
          assessment_date: string
          created_at: string | null
          gender: string
          id: string
          loading_multiplier: number | null
          maturity_offset: number | null
          phv_stage: string | null
          safety_warnings: string[] | null
          sitting_height_cm: number
          standing_height_cm: number
          training_priorities: string[] | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          age_decimal: number
          assessment_date?: string
          created_at?: string | null
          gender: string
          id?: string
          loading_multiplier?: number | null
          maturity_offset?: number | null
          phv_stage?: string | null
          safety_warnings?: string[] | null
          sitting_height_cm: number
          standing_height_cm: number
          training_priorities?: string[] | null
          user_id: string
          weight_kg: number
        }
        Update: {
          age_decimal?: number
          assessment_date?: string
          created_at?: string | null
          gender?: string
          id?: string
          loading_multiplier?: number | null
          maturity_offset?: number | null
          phv_stage?: string | null
          safety_warnings?: string[] | null
          sitting_height_cm?: number
          standing_height_cm?: number
          training_priorities?: string[] | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_phv_assessments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      player_push_tokens: {
        Row: {
          expo_push_token: string
          platform: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          expo_push_token: string
          platform?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          expo_push_token?: string
          platform?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_schedule_preferences: {
        Row: {
          athlete_mode: string | null
          buffer_default_min: number | null
          buffer_post_high_intensity_min: number | null
          buffer_post_match_min: number | null
          club_days: number[] | null
          club_start: string | null
          created_at: string | null
          day_bounds_end: string | null
          day_bounds_start: string | null
          days_per_subject: number | null
          exam_period_active: boolean | null
          exam_schedule: Json | null
          exam_start_date: string | null
          exam_subjects: string[] | null
          gym_days: number[] | null
          gym_duration_min: number | null
          gym_start: string | null
          league_is_active: boolean | null
          mode_changed_at: string | null
          mode_params_override: Json | null
          personal_dev_days: number[] | null
          personal_dev_start: string | null
          pre_exam_study_weeks: number | null
          regular_study_config: Json | null
          school_days: number[] | null
          school_end: string | null
          school_start: string | null
          sleep_end: string | null
          sleep_start: string | null
          study_days: number[] | null
          study_duration_min: number | null
          study_start: string | null
          study_subjects: string[] | null
          timezone: string | null
          training_categories: Json | null
          updated_at: string | null
          user_id: string
          weekend_bounds_end: string | null
          weekend_bounds_start: string | null
        }
        Insert: {
          athlete_mode?: string | null
          buffer_default_min?: number | null
          buffer_post_high_intensity_min?: number | null
          buffer_post_match_min?: number | null
          club_days?: number[] | null
          club_start?: string | null
          created_at?: string | null
          day_bounds_end?: string | null
          day_bounds_start?: string | null
          days_per_subject?: number | null
          exam_period_active?: boolean | null
          exam_schedule?: Json | null
          exam_start_date?: string | null
          exam_subjects?: string[] | null
          gym_days?: number[] | null
          gym_duration_min?: number | null
          gym_start?: string | null
          league_is_active?: boolean | null
          mode_changed_at?: string | null
          mode_params_override?: Json | null
          personal_dev_days?: number[] | null
          personal_dev_start?: string | null
          pre_exam_study_weeks?: number | null
          regular_study_config?: Json | null
          school_days?: number[] | null
          school_end?: string | null
          school_start?: string | null
          sleep_end?: string | null
          sleep_start?: string | null
          study_days?: number[] | null
          study_duration_min?: number | null
          study_start?: string | null
          study_subjects?: string[] | null
          timezone?: string | null
          training_categories?: Json | null
          updated_at?: string | null
          user_id: string
          weekend_bounds_end?: string | null
          weekend_bounds_start?: string | null
        }
        Update: {
          athlete_mode?: string | null
          buffer_default_min?: number | null
          buffer_post_high_intensity_min?: number | null
          buffer_post_match_min?: number | null
          club_days?: number[] | null
          club_start?: string | null
          created_at?: string | null
          day_bounds_end?: string | null
          day_bounds_start?: string | null
          days_per_subject?: number | null
          exam_period_active?: boolean | null
          exam_schedule?: Json | null
          exam_start_date?: string | null
          exam_subjects?: string[] | null
          gym_days?: number[] | null
          gym_duration_min?: number | null
          gym_start?: string | null
          league_is_active?: boolean | null
          mode_changed_at?: string | null
          mode_params_override?: Json | null
          personal_dev_days?: number[] | null
          personal_dev_start?: string | null
          pre_exam_study_weeks?: number | null
          regular_study_config?: Json | null
          school_days?: number[] | null
          school_end?: string | null
          school_start?: string | null
          sleep_end?: string | null
          sleep_start?: string | null
          study_days?: number[] | null
          study_duration_min?: number | null
          study_start?: string | null
          study_subjects?: string[] | null
          timezone?: string | null
          training_categories?: Json | null
          updated_at?: string | null
          user_id?: string
          weekend_bounds_end?: string | null
          weekend_bounds_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_schedule_preferences_athlete_mode_fkey"
            columns: ["athlete_mode"]
            isOneToOne: false
            referencedRelation: "athlete_modes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_schedule_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      position_training_matrix: {
        Row: {
          created_at: string | null
          gps_targets: Json | null
          id: string
          mandatory_programs: string[] | null
          position: string
          recommended_programs: string[] | null
          speed_targets: Json | null
          sport_id: string
          strength_targets: Json | null
          updated_at: string
          weekly_structure: Json | null
        }
        Insert: {
          created_at?: string | null
          gps_targets?: Json | null
          id?: string
          mandatory_programs?: string[] | null
          position: string
          recommended_programs?: string[] | null
          speed_targets?: Json | null
          sport_id?: string
          strength_targets?: Json | null
          updated_at?: string
          weekly_structure?: Json | null
        }
        Update: {
          created_at?: string | null
          gps_targets?: Json | null
          id?: string
          mandatory_programs?: string[] | null
          position?: string
          recommended_programs?: string[] | null
          speed_targets?: Json | null
          sport_id?: string
          strength_targets?: Json | null
          updated_at?: string
          weekly_structure?: Json | null
        }
        Relationships: []
      }
      program_interactions: {
        Row: {
          action: string
          created_at: string | null
          id: string
          program_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          program_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      programme_drills: {
        Row: {
          coach_notes: string | null
          created_at: string | null
          day_of_week: number
          drill_id: string | null
          duration_min: number | null
          id: string
          intensity: string | null
          is_mandatory: boolean | null
          order_in_day: number | null
          programme_id: string
          progression: string | null
          repeat_weeks: number | null
          reps: string
          rest_seconds: number | null
          rpe_target: number | null
          sets: number
          target_override: string | null
          target_player_ids: string[] | null
          target_position: string | null
          tempo_note: string | null
          week_number: number
        }
        Insert: {
          coach_notes?: string | null
          created_at?: string | null
          day_of_week: number
          drill_id?: string | null
          duration_min?: number | null
          id?: string
          intensity?: string | null
          is_mandatory?: boolean | null
          order_in_day?: number | null
          programme_id: string
          progression?: string | null
          repeat_weeks?: number | null
          reps?: string
          rest_seconds?: number | null
          rpe_target?: number | null
          sets?: number
          target_override?: string | null
          target_player_ids?: string[] | null
          target_position?: string | null
          tempo_note?: string | null
          week_number: number
        }
        Update: {
          coach_notes?: string | null
          created_at?: string | null
          day_of_week?: number
          drill_id?: string | null
          duration_min?: number | null
          id?: string
          intensity?: string | null
          is_mandatory?: boolean | null
          order_in_day?: number | null
          programme_id?: string
          progression?: string | null
          repeat_weeks?: number | null
          reps?: string
          rest_seconds?: number | null
          rpe_target?: number | null
          sets?: number
          target_override?: string | null
          target_player_ids?: string[] | null
          target_position?: string | null
          tempo_note?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "programme_drills_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_drills_programme_id_fkey"
            columns: ["programme_id"]
            isOneToOne: false
            referencedRelation: "coach_programmes"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_shadow_runs: {
        Row: {
          baseline_scores: Json | null
          canary_traffic_pct: number | null
          created_by: string | null
          decision: string | null
          decision_reason: string | null
          ended_at: string | null
          excludes_risk_segments: boolean
          id: string
          implicit_delta: Json | null
          p_values: Json | null
          phase: string
          started_at: string
          turns_evaluated: number
          variant_commit_hash: string | null
          variant_name: string
          variant_scores: Json | null
        }
        Insert: {
          baseline_scores?: Json | null
          canary_traffic_pct?: number | null
          created_by?: string | null
          decision?: string | null
          decision_reason?: string | null
          ended_at?: string | null
          excludes_risk_segments?: boolean
          id?: string
          implicit_delta?: Json | null
          p_values?: Json | null
          phase: string
          started_at?: string
          turns_evaluated?: number
          variant_commit_hash?: string | null
          variant_name: string
          variant_scores?: Json | null
        }
        Update: {
          baseline_scores?: Json | null
          canary_traffic_pct?: number | null
          created_by?: string | null
          decision?: string | null
          decision_reason?: string | null
          ended_at?: string | null
          excludes_risk_segments?: boolean
          id?: string
          implicit_delta?: Json | null
          p_values?: Json | null
          phase?: string
          started_at?: string
          turns_evaluated?: number
          variant_commit_hash?: string | null
          variant_name?: string
          variant_scores?: Json | null
        }
        Relationships: []
      }
      quality_drift_alerts: {
        Row: {
          alerted_at: string
          baseline_mean: number | null
          current_mean: number | null
          cusum_value: number | null
          dimension: string
          id: string
          matched_pattern_id: string | null
          proposed_patch: Json | null
          proposed_pr_url: string | null
          resolution_notes: string | null
          resolved_at: string | null
          segment_key: Json
          status: string
          window_days: number
        }
        Insert: {
          alerted_at?: string
          baseline_mean?: number | null
          current_mean?: number | null
          cusum_value?: number | null
          dimension: string
          id?: string
          matched_pattern_id?: string | null
          proposed_patch?: Json | null
          proposed_pr_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          segment_key: Json
          status?: string
          window_days?: number
        }
        Update: {
          alerted_at?: string
          baseline_mean?: number | null
          current_mean?: number | null
          cusum_value?: number | null
          dimension?: string
          id?: string
          matched_pattern_id?: string | null
          proposed_patch?: Json | null
          proposed_pr_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          segment_key?: Json
          status?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_drift_alerts_matched_pattern_id_fkey"
            columns: ["matched_pattern_id"]
            isOneToOne: false
            referencedRelation: "auto_repair_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_knowledge_chunks: {
        Row: {
          age_groups: string[] | null
          athlete_summary: string | null
          chunk_id: string
          coach_summary: string | null
          content: string
          contexts: string[] | null
          created_at: string | null
          domain: string
          embedding: string | null
          evidence_grade: string | null
          institution_id: string | null
          last_reviewed: string | null
          phv_stages: string[] | null
          primary_source: string | null
          rec_types: string[] | null
          search_vector: unknown
          sports: string[] | null
          title: string
        }
        Insert: {
          age_groups?: string[] | null
          athlete_summary?: string | null
          chunk_id?: string
          coach_summary?: string | null
          content: string
          contexts?: string[] | null
          created_at?: string | null
          domain: string
          embedding?: string | null
          evidence_grade?: string | null
          institution_id?: string | null
          last_reviewed?: string | null
          phv_stages?: string[] | null
          primary_source?: string | null
          rec_types?: string[] | null
          search_vector?: unknown
          sports?: string[] | null
          title: string
        }
        Update: {
          age_groups?: string[] | null
          athlete_summary?: string | null
          chunk_id?: string
          coach_summary?: string | null
          content?: string
          contexts?: string[] | null
          created_at?: string | null
          domain?: string
          embedding?: string | null
          evidence_grade?: string | null
          institution_id?: string | null
          last_reviewed?: string | null
          phv_stages?: string[] | null
          primary_source?: string | null
          rec_types?: string[] | null
          search_vector?: unknown
          sports?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_knowledge_chunks_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "cms_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rec_delivery_log: {
        Row: {
          delivered_at: string
          delivered_via: string
          interacted_at: string | null
          interaction: string | null
          log_id: string
          rec_id: string
        }
        Insert: {
          delivered_at?: string
          delivered_via: string
          interacted_at?: string | null
          interaction?: string | null
          log_id?: string
          rec_id: string
        }
        Update: {
          delivered_at?: string
          delivered_via?: string
          interacted_at?: string | null
          interaction?: string | null
          log_id?: string
          rec_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rec_delivery_log_rec_id_fkey"
            columns: ["rec_id"]
            isOneToOne: false
            referencedRelation: "athlete_recommendations"
            referencedColumns: ["rec_id"]
          },
        ]
      }
      relationships: {
        Row: {
          accepted_at: string | null
          created_at: string
          guardian_id: string
          id: string
          invite_code: string | null
          player_id: string
          relationship_type: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          guardian_id: string
          id?: string
          invite_code?: string | null
          player_id: string
          relationship_type: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          guardian_id?: string
          id?: string
          invite_code?: string | null
          player_id?: string
          relationship_type?: string
          status?: string
        }
        Relationships: []
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
      safety_audit_flags: {
        Row: {
          audit_log_id: string
          created_at: string
          flag_type: string
          id: string
          resolution: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          severity: string
          status: string
        }
        Insert: {
          audit_log_id: string
          created_at?: string
          flag_type: string
          id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          severity: string
          status?: string
        }
        Update: {
          audit_log_id?: string
          created_at?: string
          flag_type?: string
          id?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_audit_flags_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "safety_audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_audit_log: {
        Row: {
          age_band: string | null
          auditor_cost_usd: number | null
          auditor_latency_ms: number | null
          auditor_model: string | null
          auditor_verdict: string | null
          created_at: string
          id: string
          phv_stage: string | null
          response_hash: string | null
          rule_fired: boolean
          rule_trigger: string | null
          session_id: string | null
          trace_id: string
          turn_id: string
          user_id: string | null
        }
        Insert: {
          age_band?: string | null
          auditor_cost_usd?: number | null
          auditor_latency_ms?: number | null
          auditor_model?: string | null
          auditor_verdict?: string | null
          created_at?: string
          id?: string
          phv_stage?: string | null
          response_hash?: string | null
          rule_fired: boolean
          rule_trigger?: string | null
          session_id?: string | null
          trace_id: string
          turn_id: string
          user_id?: string | null
        }
        Update: {
          age_band?: string | null
          auditor_cost_usd?: number | null
          auditor_latency_ms?: number | null
          auditor_model?: string | null
          auditor_verdict?: string | null
          created_at?: string
          id?: string
          phv_stage?: string | null
          response_hash?: string | null
          rule_fired?: boolean
          rule_trigger?: string | null
          session_id?: string | null
          trace_id?: string
          turn_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      safety_gate_config: {
        Row: {
          block_hard_on_red: boolean
          block_hard_on_yellow: boolean
          block_moderate_on_red: boolean
          enabled: boolean
          id: string
          load_block_message: string
          max_hard_per_week: number
          min_rest_hours_after_hard: number
          pain_block_message: string
          pain_keywords: string[]
          red_block_message: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_hard_on_red?: boolean
          block_hard_on_yellow?: boolean
          block_moderate_on_red?: boolean
          enabled?: boolean
          id?: string
          load_block_message?: string
          max_hard_per_week?: number
          min_rest_hours_after_hard?: number
          pain_block_message?: string
          pain_keywords?: string[]
          red_block_message?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_hard_on_red?: boolean
          block_hard_on_yellow?: boolean
          block_moderate_on_red?: boolean
          enabled?: boolean
          id?: string
          load_block_message?: string
          max_hard_per_week?: number
          min_rest_hours_after_hard?: number
          pain_block_message?: string
          pain_keywords?: string[]
          red_block_message?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      scheduling_rules: {
        Row: {
          config: Json
          id: string
          is_active: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          config: Json
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
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
          age_band: string | null
          age_max: number
          age_min: number
          attribute_key: string
          competition_lvl: string | null
          created_at: string
          direction: string
          gender: string | null
          id: string
          mean_val: number | null
          means: Json
          metric_key: string | null
          metric_label: string | null
          metric_name: string
          p10: number | null
          p25: number | null
          p50: number | null
          p75: number | null
          p90: number | null
          position_group: string | null
          position_key: string
          sample_size: number | null
          sds: Json
          source_ref: string | null
          sport_id: string
          std_dev: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          age_band?: string | null
          age_max?: number
          age_min?: number
          attribute_key: string
          competition_lvl?: string | null
          created_at?: string
          direction: string
          gender?: string | null
          id?: string
          mean_val?: number | null
          means?: Json
          metric_key?: string | null
          metric_label?: string | null
          metric_name: string
          p10?: number | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          position_group?: string | null
          position_key?: string
          sample_size?: number | null
          sds?: Json
          source_ref?: string | null
          sport_id: string
          std_dev?: number | null
          unit?: string
          updated_at?: string
        }
        Update: {
          age_band?: string | null
          age_max?: number
          age_min?: number
          attribute_key?: string
          competition_lvl?: string | null
          created_at?: string
          direction?: string
          gender?: string | null
          id?: string
          mean_val?: number | null
          means?: Json
          metric_key?: string | null
          metric_label?: string | null
          metric_name?: string
          p10?: number | null
          p25?: number | null
          p50?: number | null
          p75?: number | null
          p90?: number | null
          position_group?: string | null
          position_key?: string
          sample_size?: number | null
          sds?: Json
          source_ref?: string | null
          sport_id?: string
          std_dev?: number | null
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
      suggestions: {
        Row: {
          author_id: string
          author_role: string
          created_at: string
          expires_at: string | null
          id: string
          payload: Json
          player_id: string
          player_notes: string | null
          resolved_at: string | null
          status: string
          suggestion_type: string
          title: string
        }
        Insert: {
          author_id: string
          author_role: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payload?: Json
          player_id: string
          player_notes?: string | null
          resolved_at?: string | null
          status?: string
          suggestion_type: string
          title: string
        }
        Update: {
          author_id?: string
          author_role?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          payload?: Json
          player_id?: string
          player_notes?: string | null
          resolved_at?: string | null
          status?: string
          suggestion_type?: string
          title?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          created_at: string
          duration_weeks: number
          end_date: string
          ended_at: string | null
          goals: Json | null
          id: string
          load_targets: Json | null
          name: string
          phase: string
          phase_transitioned_at: string | null
          program_id: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          duration_weeks: number
          end_date: string
          ended_at?: string | null
          goals?: Json | null
          id?: string
          load_targets?: Json | null
          name: string
          phase: string
          phase_transitioned_at?: string | null
          program_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
          week_number?: number
        }
        Update: {
          created_at?: string
          duration_weeks?: number
          end_date?: string
          ended_at?: string | null
          goals?: Json | null
          id?: string
          load_targets?: Json | null
          name?: string
          phase?: string
          phase_transitioned_at?: string | null
          program_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: []
      }
      training_category_templates: {
        Row: {
          color: string
          created_at: string | null
          default_days_per_week: number | null
          default_mode: string | null
          default_preferred_time: string | null
          default_session_duration: number | null
          icon: string
          id: string
          is_enabled: boolean | null
          label: string
          sort_order: number | null
          sport_filter: string[] | null
          updated_at: string | null
        }
        Insert: {
          color: string
          created_at?: string | null
          default_days_per_week?: number | null
          default_mode?: string | null
          default_preferred_time?: string | null
          default_session_duration?: number | null
          icon: string
          id: string
          is_enabled?: boolean | null
          label: string
          sort_order?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          default_days_per_week?: number | null
          default_mode?: string | null
          default_preferred_time?: string | null
          default_session_duration?: number | null
          icon?: string
          id?: string
          is_enabled?: boolean | null
          label?: string
          sort_order?: number | null
          sport_filter?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      training_drills: {
        Row: {
          active: boolean
          age_bands: Json
          attribute_keys: Json
          category: string
          created_at: string
          description: string
          duration_minutes: number
          id: string
          image_url: string | null
          instructions: Json
          intensity: string
          name: string
          players_max: number
          players_min: number
          position_keys: Json
          primary_attribute: string | null
          slug: string
          sort_order: number
          sport_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          active?: boolean
          age_bands?: Json
          attribute_keys?: Json
          category?: string
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          image_url?: string | null
          instructions?: Json
          intensity: string
          name: string
          players_max?: number
          players_min?: number
          position_keys?: Json
          primary_attribute?: string | null
          slug: string
          sort_order?: number
          sport_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          active?: boolean
          age_bands?: Json
          attribute_keys?: Json
          category?: string
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          image_url?: string | null
          instructions?: Json
          intensity?: string
          name?: string
          players_max?: number
          players_min?: number
          position_keys?: Json
          primary_attribute?: string | null
          slug?: string
          sort_order?: number
          sport_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_drills_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      training_journals: {
        Row: {
          ai_insight: string | null
          ai_insight_generated: boolean | null
          calendar_event_id: string
          created_at: string
          event_date: string
          id: string
          journal_state: string
          journal_variant: string
          locked_at: string | null
          post_body_feel: number | null
          post_next_focus: string | null
          post_outcome: string | null
          post_reflection: string | null
          post_set_at: string | null
          pre_focus_tag: string | null
          pre_mental_cue: string | null
          pre_set_at: string | null
          pre_target: string | null
          training_category: string
          training_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_insight?: string | null
          ai_insight_generated?: boolean | null
          calendar_event_id: string
          created_at?: string
          event_date: string
          id?: string
          journal_state?: string
          journal_variant?: string
          locked_at?: string | null
          post_body_feel?: number | null
          post_next_focus?: string | null
          post_outcome?: string | null
          post_reflection?: string | null
          post_set_at?: string | null
          pre_focus_tag?: string | null
          pre_mental_cue?: string | null
          pre_set_at?: string | null
          pre_target?: string | null
          training_category: string
          training_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_insight?: string | null
          ai_insight_generated?: boolean | null
          calendar_event_id?: string
          created_at?: string
          event_date?: string
          id?: string
          journal_state?: string
          journal_variant?: string
          locked_at?: string | null
          post_body_feel?: number | null
          post_next_focus?: string | null
          post_outcome?: string | null
          post_reflection?: string | null
          post_set_at?: string | null
          pre_focus_tag?: string | null
          pre_mental_cue?: string | null
          pre_set_at?: string | null
          pre_target?: string | null
          training_category?: string
          training_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_journals_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_journals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          active: boolean
          category: string
          chat_eligible: boolean
          created_at: string
          description: string
          difficulty: string
          duration_minutes: number
          duration_weeks: number
          equipment: Json
          id: string
          name: string
          phv_guidance: Json
          position_emphasis: Json
          prescriptions: Json
          sort_order: number
          sport_id: string
          tags: Json
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          chat_eligible?: boolean
          created_at?: string
          description?: string
          difficulty?: string
          duration_minutes?: number
          duration_weeks?: number
          equipment?: Json
          id?: string
          name: string
          phv_guidance?: Json
          position_emphasis?: Json
          prescriptions?: Json
          sort_order?: number
          sport_id?: string
          tags?: Json
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          chat_eligible?: boolean
          created_at?: string
          description?: string
          difficulty?: string
          duration_minutes?: number
          duration_weeks?: number
          equipment?: Json
          id?: string
          name?: string
          phv_guidance?: Json
          position_emphasis?: Json
          prescriptions?: Json
          sort_order?: number
          sport_id?: string
          tags?: Json
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ui_config: {
        Row: {
          config_key: string
          config_value: Json
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ui_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_drill_history: {
        Row: {
          completed_at: string
          created_at: string
          drill_id: string
          duration_actual: number | null
          id: string
          notes: string | null
          rating: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          drill_id: string
          duration_actual?: number | null
          id?: string
          notes?: string | null
          rating?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          drill_id?: string
          duration_actual?: number | null
          id?: string
          notes?: string | null
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_drill_history_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          age: number | null
          archetype: string | null
          avatar_url: string | null
          connected_wearables: Json | null
          created_at: string
          current_streak: number
          custom_training_types: Json | null
          date_of_birth: string | null
          days_since_rest: number
          display_name: string | null
          display_role: string | null
          education_type: string | null
          education_year: number | null
          email: string
          exam_periods: Json | null
          exam_schedule: Json | null
          fcm_token: string | null
          football_competition: string | null
          football_experience: string | null
          football_position: string | null
          football_self_assessment: Json | null
          freeze_tokens: number
          gender: string | null
          health_kit_connected: boolean | null
          height: number | null
          height_cm: number | null
          id: string
          is_admin: boolean | null
          last_compliant_date: string | null
          longest_streak: number
          name: string
          nationality: string | null
          onboarding_complete: boolean
          parent_guardian_email: string | null
          parent_guardian_name: string | null
          parent_guardian_phone: string | null
          parental_consent: boolean | null
          passport_country: string | null
          photo_url: string | null
          playing_style: string | null
          position: string | null
          preferred_foot: string | null
          primary_goal: string | null
          recruitment_visibility_level: string | null
          recruitment_visible: boolean | null
          region: string | null
          role: string
          school_hours: number | null
          school_schedule: Json | null
          season_phase: string | null
          secondary_positions: string[] | null
          selected_sports: Json | null
          sport: string
          streak_multiplier: number | null
          study_plan_config: Json | null
          study_subjects: Json | null
          team_id: string | null
          total_points: number
          training_preferences: Json | null
          updated_at: string
          weekly_training_days: number | null
          weight: number | null
          weight_kg: number | null
        }
        Insert: {
          age?: number | null
          archetype?: string | null
          avatar_url?: string | null
          connected_wearables?: Json | null
          created_at?: string
          current_streak?: number
          custom_training_types?: Json | null
          date_of_birth?: string | null
          days_since_rest?: number
          display_name?: string | null
          display_role?: string | null
          education_type?: string | null
          education_year?: number | null
          email: string
          exam_periods?: Json | null
          exam_schedule?: Json | null
          fcm_token?: string | null
          football_competition?: string | null
          football_experience?: string | null
          football_position?: string | null
          football_self_assessment?: Json | null
          freeze_tokens?: number
          gender?: string | null
          health_kit_connected?: boolean | null
          height?: number | null
          height_cm?: number | null
          id: string
          is_admin?: boolean | null
          last_compliant_date?: string | null
          longest_streak?: number
          name?: string
          nationality?: string | null
          onboarding_complete?: boolean
          parent_guardian_email?: string | null
          parent_guardian_name?: string | null
          parent_guardian_phone?: string | null
          parental_consent?: boolean | null
          passport_country?: string | null
          photo_url?: string | null
          playing_style?: string | null
          position?: string | null
          preferred_foot?: string | null
          primary_goal?: string | null
          recruitment_visibility_level?: string | null
          recruitment_visible?: boolean | null
          region?: string | null
          role?: string
          school_hours?: number | null
          school_schedule?: Json | null
          season_phase?: string | null
          secondary_positions?: string[] | null
          selected_sports?: Json | null
          sport?: string
          streak_multiplier?: number | null
          study_plan_config?: Json | null
          study_subjects?: Json | null
          team_id?: string | null
          total_points?: number
          training_preferences?: Json | null
          updated_at?: string
          weekly_training_days?: number | null
          weight?: number | null
          weight_kg?: number | null
        }
        Update: {
          age?: number | null
          archetype?: string | null
          avatar_url?: string | null
          connected_wearables?: Json | null
          created_at?: string
          current_streak?: number
          custom_training_types?: Json | null
          date_of_birth?: string | null
          days_since_rest?: number
          display_name?: string | null
          display_role?: string | null
          education_type?: string | null
          education_year?: number | null
          email?: string
          exam_periods?: Json | null
          exam_schedule?: Json | null
          fcm_token?: string | null
          football_competition?: string | null
          football_experience?: string | null
          football_position?: string | null
          football_self_assessment?: Json | null
          freeze_tokens?: number
          gender?: string | null
          health_kit_connected?: boolean | null
          height?: number | null
          height_cm?: number | null
          id?: string
          is_admin?: boolean | null
          last_compliant_date?: string | null
          longest_streak?: number
          name?: string
          nationality?: string | null
          onboarding_complete?: boolean
          parent_guardian_email?: string | null
          parent_guardian_name?: string | null
          parent_guardian_phone?: string | null
          parental_consent?: boolean | null
          passport_country?: string | null
          photo_url?: string | null
          playing_style?: string | null
          position?: string | null
          preferred_foot?: string | null
          primary_goal?: string | null
          recruitment_visibility_level?: string | null
          recruitment_visible?: boolean | null
          region?: string | null
          role?: string
          school_hours?: number | null
          school_schedule?: Json | null
          season_phase?: string | null
          secondary_positions?: string[] | null
          selected_sports?: Json | null
          sport?: string
          streak_multiplier?: number | null
          study_plan_config?: Json | null
          study_subjects?: Json | null
          team_id?: string | null
          total_points?: number
          training_preferences?: Json | null
          updated_at?: string
          weekly_training_days?: number | null
          weight?: number | null
          weight_kg?: number | null
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
      wearable_connections: {
        Row: {
          access_token: string
          connected_at: string | null
          external_user_id: string | null
          id: string
          last_sync_at: string | null
          metadata: Json | null
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          sync_error: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          external_user_id?: string | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          external_user_id?: string | null
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          sync_error?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wearable_connections_user_id_fkey"
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
      daily_api_costs: {
        Row: {
          agent_type: string | null
          avg_latency: number | null
          call_count: number | null
          day: string | null
          model: string | null
          total_cost: number | null
          total_input: number | null
          total_output: number | null
        }
        Relationships: []
      }
      v_quality_scores_aggregated: {
        Row: {
          age_band: string | null
          agent: string | null
          day: string | null
          mean_age_fit: number | null
          mean_faithfulness: number | null
          mean_tone: number | null
          sampling_stratum: string | null
          sport: string | null
          total_cost_usd: number | null
          turn_count: number | null
        }
        Relationships: []
      }
      v_quality_scores_daily_by_segment: {
        Row: {
          actionability: number | null
          age_band: string | null
          age_fit: number | null
          agent: string | null
          answer_quality: number | null
          conversational: number | null
          day: string | null
          empathy: number | null
          faithfulness: number | null
          has_rag: boolean | null
          personalization: number | null
          sport: string | null
          tone: number | null
        }
        Relationships: []
      }
      v_safety_audit_open_flags: {
        Row: {
          age_band: string | null
          auditor_model: string | null
          flag_id: string | null
          flag_type: string | null
          flagged_at: string | null
          phv_stage: string | null
          rule_trigger: string | null
          severity: string | null
          turn_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      content_manifest: { Args: never; Returns: Json }
      get_tenant_ancestry: { Args: { p_tenant_id: string }; Returns: string[] }
      get_user_tenant_role: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      match_knowledge_chunks_text: {
        Args: {
          filter_age_groups?: string[]
          filter_phv_stages?: string[]
          filter_rec_types?: string[]
          match_count?: number
          query_text: string
        }
        Returns: {
          athlete_summary: string
          chunk_id: string
          content: string
          domain: string
          evidence_grade: string
          rank: number
          title: string
        }[]
      }
      match_knowledge_entities: {
        Args: {
          filter_entity_types?: string[]
          filter_institution_ids?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          description: string
          display_name: string
          entity_type: string
          id: string
          name: string
          properties: Json
          similarity: number
        }[]
      }
      resolve_protocols_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: {
          category: string
          institution_id: string
          is_built_in: boolean
          name: string
          priority: number
          protocol_id: string
          safety_critical: boolean
          source_tier: string
        }[]
      }
      traverse_knowledge_graph: {
        Args: {
          direction?: string
          max_results?: number
          relation_types?: string[]
          start_entity_id: string
        }
        Returns: {
          rel_properties: Json
          rel_weight: number
          related_desc: string
          related_display: string
          related_entity_id: string
          related_name: string
          related_type: string
          relation_type: string
          relationship_id: string
        }[]
      }
      traverse_knowledge_graph_2hop: {
        Args: {
          hop1_relations?: string[]
          hop2_relations?: string[]
          max_results?: number
          start_entity_id: string
        }
        Returns: {
          hop1_entity_id: string
          hop1_entity_name: string
          hop1_entity_type: string
          hop1_relation: string
          hop2_description: string
          hop2_entity_id: string
          hop2_entity_name: string
          hop2_entity_type: string
          hop2_relation: string
          total_weight: number
        }[]
      }
    }
    Enums: {
      knowledge_override_type: "inherit" | "extend" | "override" | "block"
      org_role:
        | "super_admin"
        | "institutional_pd"
        | "coach"
        | "analyst"
        | "athlete"
      tenant_tier: "global" | "institution" | "group"
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
    Enums: {
      knowledge_override_type: ["inherit", "extend", "override", "block"],
      org_role: [
        "super_admin",
        "institutional_pd",
        "coach",
        "analyst",
        "athlete",
      ],
      tenant_tier: ["global", "institution", "group"],
    },
  },
} as const
