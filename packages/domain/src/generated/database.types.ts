export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      anonymous_sessions: {
        Row: {
          created_at: string;
          id: string;
          merged_at: string | null;
          merged_into_user_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          merged_at?: string | null;
          merged_into_user_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merged_at?: string | null;
          merged_into_user_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "anonymous_sessions_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "anonymous_sessions_merged_into_user_id_fkey";
            columns: ["merged_into_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_events: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          occurred_at: string;
          properties: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
          occurred_at?: string;
          properties?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          occurred_at?: string;
          properties?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_versions: {
        Row: {
          created_at: string;
          domain: string;
          id: string;
          published_at: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          domain: string;
          id?: string;
          published_at?: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          created_at?: string;
          domain?: string;
          id?: string;
          published_at?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      dog_goals: {
        Row: {
          created_at: string;
          dog_id: string;
          goal_id: string;
          id: string;
          priority: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dog_id: string;
          goal_id: string;
          id?: string;
          priority: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dog_id?: string;
          goal_id?: string;
          id?: string;
          priority?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dog_goals_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: false;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dog_goals_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "training_goals";
            referencedColumns: ["id"];
          },
        ];
      };
      dog_skills: {
        Row: {
          created_at: string;
          dog_id: string;
          id: string;
          skill_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dog_id: string;
          id?: string;
          skill_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dog_id?: string;
          id?: string;
          skill_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dog_skills_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: false;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dog_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      dogs: {
        Row: {
          birthdate: string | null;
          breed: string | null;
          created_at: string;
          daily_training_minutes: number | null;
          id: string;
          name: string;
          owner_user_id: string;
          photo_url: string | null;
          sex: string;
          updated_at: string;
        };
        Insert: {
          birthdate?: string | null;
          breed?: string | null;
          created_at?: string;
          daily_training_minutes?: number | null;
          id?: string;
          name: string;
          owner_user_id: string;
          photo_url?: string | null;
          sex?: string;
          updated_at?: string;
        };
        Update: {
          birthdate?: string | null;
          breed?: string | null;
          created_at?: string;
          daily_training_minutes?: number | null;
          id?: string;
          name?: string;
          owner_user_id?: string;
          photo_url?: string | null;
          sex?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dogs_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlements: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          is_premium_active: boolean;
          source: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_premium_active?: boolean;
          source?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_premium_active?: boolean;
          source?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_steps: {
        Row: {
          created_at: string;
          id: string;
          illustration_asset_key: string | null;
          instruction_key: string;
          lesson_id: string;
          repetition_target: number | null;
          requires_clicker_press: boolean;
          step_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          illustration_asset_key?: string | null;
          instruction_key: string;
          lesson_id: string;
          repetition_target?: number | null;
          requires_clicker_press?: boolean;
          step_order: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          illustration_asset_key?: string | null;
          instruction_key?: string;
          lesson_id?: string;
          repetition_target?: number | null;
          requires_clicker_press?: boolean;
          step_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_steps_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_troubleshooting: {
        Row: {
          created_at: string;
          guidance_key: string;
          id: string;
          lesson_id: string;
          prompt_key: string;
          safety_category: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          guidance_key: string;
          id?: string;
          lesson_id: string;
          prompt_key: string;
          safety_category: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          guidance_key?: string;
          id?: string;
          lesson_id?: string;
          prompt_key?: string;
          safety_category?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_troubleshooting_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          content_version_id: string;
          created_at: string;
          difficulty: number;
          equipment: string[];
          estimated_minutes: number;
          goal_key: string;
          id: string;
          is_always_free: boolean;
          prerequisite_skill_ids: string[];
          skill_id: string;
          slug: string;
          title_key: string;
          updated_at: string;
        };
        Insert: {
          content_version_id: string;
          created_at?: string;
          difficulty: number;
          equipment?: string[];
          estimated_minutes: number;
          goal_key: string;
          id?: string;
          is_always_free?: boolean;
          prerequisite_skill_ids?: string[];
          skill_id: string;
          slug: string;
          title_key: string;
          updated_at?: string;
        };
        Update: {
          content_version_id?: string;
          created_at?: string;
          difficulty?: number;
          equipment?: string[];
          estimated_minutes?: number;
          goal_key?: string;
          id?: string;
          is_always_free?: boolean;
          prerequisite_skill_ids?: string[];
          skill_id?: string;
          slug?: string;
          title_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_content_version_id_fkey";
            columns: ["content_version_id"];
            isOneToOne: false;
            referencedRelation: "content_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          created_at: string;
          id: string;
          os_permission_granted: boolean | null;
          training_reminders_enabled: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          os_permission_granted?: boolean | null;
          training_reminders_enabled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          os_permission_granted?: boolean | null;
          training_reminders_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_activities: {
        Row: {
          created_at: string;
          estimated_minutes: number;
          id: string;
          is_review: boolean;
          lesson_id: string;
          plan_day_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          estimated_minutes: number;
          id?: string;
          is_review?: boolean;
          lesson_id: string;
          plan_day_id: string;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          estimated_minutes?: number;
          id?: string;
          is_review?: boolean;
          lesson_id?: string;
          plan_day_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_activities_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_activities_plan_day_id_fkey";
            columns: ["plan_day_id"];
            isOneToOne: false;
            referencedRelation: "plan_days";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_days: {
        Row: {
          created_at: string;
          date: string;
          day_index: number;
          id: string;
          plan_id: string;
          total_minutes: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          day_index: number;
          id?: string;
          plan_id: string;
          total_minutes: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          day_index?: number;
          id?: string;
          plan_id?: string;
          total_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_days_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "training_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_engine_versions: {
        Row: {
          changelog_key: string | null;
          created_at: string;
          id: string;
          released_at: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          changelog_key?: string | null;
          created_at?: string;
          id?: string;
          released_at?: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          changelog_key?: string | null;
          created_at?: string;
          id?: string;
          released_at?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          has_completed_onboarding: boolean;
          id: string;
          is_anonymous: boolean;
          is_private_relay_email: boolean;
          preferred_locale: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          has_completed_onboarding?: boolean;
          id: string;
          is_anonymous?: boolean;
          is_private_relay_email?: boolean;
          preferred_locale?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          has_completed_onboarding?: boolean;
          id?: string;
          is_anonymous?: boolean;
          is_private_relay_email?: boolean;
          preferred_locale?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      progress: {
        Row: {
          created_at: string;
          dog_id: string;
          id: string;
          last_recalculated_at: string;
          sessions_completed: number;
          skills_in_progress_count: number;
          skills_mastered_count: number;
          training_minutes_total: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dog_id: string;
          id?: string;
          last_recalculated_at?: string;
          sessions_completed?: number;
          skills_in_progress_count?: number;
          skills_mastered_count?: number;
          training_minutes_total?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dog_id?: string;
          id?: string;
          last_recalculated_at?: string;
          sessions_completed?: number;
          skills_in_progress_count?: number;
          skills_mastered_count?: number;
          training_minutes_total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: true;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_events: {
        Row: {
          created_at: string;
          id: string;
          received_at: string;
          store: string;
          store_event_id: string;
          subscription_id: string | null;
          type: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          received_at?: string;
          store: string;
          store_event_id: string;
          subscription_id?: string | null;
          type: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          received_at?: string;
          store?: string;
          store_event_id?: string;
          subscription_id?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reminders: {
        Row: {
          created_at: string;
          dog_id: string;
          id: string;
          scheduled_for: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dog_id: string;
          id?: string;
          scheduled_for: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dog_id?: string;
          id?: string;
          scheduled_for?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reminders_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: false;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
        ];
      };
      session_events: {
        Row: {
          created_at: string;
          id: string;
          lesson_step_id: string | null;
          occurred_at: string;
          session_id: string;
          troubleshooting_option_id: string | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          lesson_step_id?: string | null;
          occurred_at: string;
          session_id: string;
          troubleshooting_option_id?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lesson_step_id?: string | null;
          occurred_at?: string;
          session_id?: string;
          troubleshooting_option_id?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_events_lesson_step_id_fkey";
            columns: ["lesson_step_id"];
            isOneToOne: false;
            referencedRelation: "lesson_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "training_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_events_troubleshooting_option_id_fkey";
            columns: ["troubleshooting_option_id"];
            isOneToOne: false;
            referencedRelation: "lesson_troubleshooting";
            referencedColumns: ["id"];
          },
        ];
      };
      skills: {
        Row: {
          created_at: string;
          difficulty: number;
          id: string;
          prerequisite_skill_ids: string[];
          slug: string;
          title_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          difficulty: number;
          id?: string;
          prerequisite_skill_ids?: string[];
          slug: string;
          title_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          difficulty?: number;
          id?: string;
          prerequisite_skill_ids?: string[];
          slug?: string;
          title_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      streaks: {
        Row: {
          created_at: string;
          current_streak_days: number;
          dog_id: string;
          id: string;
          last_trained_date: string | null;
          longest_streak_days: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_streak_days?: number;
          dog_id: string;
          id?: string;
          last_trained_date?: string | null;
          longest_streak_days?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_streak_days?: number;
          dog_id?: string;
          id?: string;
          last_trained_date?: string | null;
          longest_streak_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "streaks_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: true;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          id: string;
          product_id: string;
          status: string;
          store: string;
          store_transaction_id: string;
          trial_ends_at: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          product_id: string;
          status: string;
          store: string;
          store_transaction_id: string;
          trial_ends_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          product_id?: string;
          status?: string;
          store?: string;
          store_transaction_id?: string;
          trial_ends_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      training_goals: {
        Row: {
          created_at: string;
          description_key: string;
          id: string;
          slug: string;
          sort_order: number;
          title_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_key: string;
          id?: string;
          slug: string;
          sort_order?: number;
          title_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_key?: string;
          id?: string;
          slug?: string;
          sort_order?: number;
          title_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      training_plans: {
        Row: {
          created_at: string;
          daily_minutes: number;
          dog_id: string;
          id: string;
          length_days: number;
          plan_engine_version_id: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          daily_minutes: number;
          dog_id: string;
          id?: string;
          length_days: number;
          plan_engine_version_id: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          daily_minutes?: number;
          dog_id?: string;
          id?: string;
          length_days?: number;
          plan_engine_version_id?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_plans_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: false;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_plans_plan_engine_version_id_fkey";
            columns: ["plan_engine_version_id"];
            isOneToOne: false;
            referencedRelation: "plan_engine_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      training_sessions: {
        Row: {
          completed_at: string | null;
          created_at: string;
          dog_id: string;
          id: string;
          lesson_id: string;
          plan_activity_id: string | null;
          started_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          dog_id: string;
          id?: string;
          lesson_id: string;
          plan_activity_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          dog_id?: string;
          id?: string;
          lesson_id?: string;
          plan_activity_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_sessions_dog_id_fkey";
            columns: ["dog_id"];
            isOneToOne: false;
            referencedRelation: "dogs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_sessions_plan_activity_id_fkey";
            columns: ["plan_activity_id"];
            isOneToOne: false;
            referencedRelation: "plan_activities";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      merge_guest_session: {
        Args: { p_anonymous_user_id: string; p_target_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
