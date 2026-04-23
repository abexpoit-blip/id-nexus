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
      accounts: {
        Row: {
          buyer_id: string | null
          category_id: string
          cost_bdt: number | null
          created_at: string
          email: string | null
          email_password: string | null
          extra: Json | null
          id: string
          password: string
          seller_id: string
          sold_at: string | null
          status: Database["public"]["Enums"]["account_status"]
          two_fa: string | null
          uid: string
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          category_id: string
          cost_bdt?: number | null
          created_at?: string
          email?: string | null
          email_password?: string | null
          extra?: Json | null
          id?: string
          password: string
          seller_id: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          two_fa?: string | null
          uid: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          category_id?: string
          cost_bdt?: number | null
          created_at?: string
          email?: string | null
          email_password?: string | null
          extra?: Json | null
          id?: string
          password?: string
          seller_id?: string
          sold_at?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          two_fa?: string | null
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          summary: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          summary: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          summary?: string
        }
        Relationships: []
      }
      balance_ledger: {
        Row: {
          amount_bdt: number
          balance_after: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          note: string | null
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount_bdt: number
          balance_after: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount_bdt?: number
          balance_after?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          price_bdt: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name: string
          price_bdt: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          price_bdt?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          reference_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          reference_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          reference_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          account_id: string
          created_at: string
          id: string
          order_id: string
          seller_id: string
          unit_price_bdt: number
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          order_id: string
          seller_id: string
          unit_price_bdt: number
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          order_id?: string
          seller_id?: string
          unit_price_bdt?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          category_id: string
          created_at: string
          id: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_bdt: number
          unit_price_bdt: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          category_id: string
          created_at?: string
          id?: string
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          total_bdt: number
          unit_price_bdt: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          category_id?: string
          created_at?: string
          id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_bdt?: number
          unit_price_bdt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance_bdt: number
          buyer_settings: Json
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_banned: boolean
          telegram_chat_id: number | null
          telegram_link_code: string
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          balance_bdt?: number
          buyer_settings?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_banned?: boolean
          telegram_chat_id?: number | null
          telegram_link_code: string
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          balance_bdt?: number
          buyer_settings?: Json
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_banned?: boolean
          telegram_chat_id?: number | null
          telegram_link_code?: string
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      replacement_items: {
        Row: {
          account_id: string | null
          buyer_id: string
          created_at: string
          id: string
          in_window: boolean
          order_id: string | null
          outcome: Database["public"]["Enums"]["replacement_item_outcome"]
          outcome_reason: string | null
          replacement_account_id: string | null
          reported_uid: string
          request_id: string
          resolved_at: string | null
          resolved_by: string | null
          seller_id: string | null
          window_hours: number | null
        }
        Insert: {
          account_id?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          in_window?: boolean
          order_id?: string | null
          outcome?: Database["public"]["Enums"]["replacement_item_outcome"]
          outcome_reason?: string | null
          replacement_account_id?: string | null
          reported_uid: string
          request_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          window_hours?: number | null
        }
        Update: {
          account_id?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          in_window?: boolean
          order_id?: string | null
          outcome?: Database["public"]["Enums"]["replacement_item_outcome"]
          outcome_reason?: string | null
          replacement_account_id?: string | null
          reported_uid?: string
          request_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          seller_id?: string | null
          window_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "replacement_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "replacement_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_requests: {
        Row: {
          admin_note: string | null
          buyer_id: string
          created_at: string
          id: string
          matched_count: number
          parsed_uid_count: number
          raw_input: string
          status: Database["public"]["Enums"]["replacement_status"]
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          matched_count?: number
          parsed_uid_count?: number
          raw_input: string
          status?: Database["public"]["Enums"]["replacement_status"]
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          matched_count?: number
          parsed_uid_count?: number
          raw_input?: string
          status?: Database["public"]["Enums"]["replacement_status"]
          updated_at?: string
        }
        Relationships: []
      }
      seller_applications: {
        Row: {
          admin_note: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["seller_application_status"]
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["seller_application_status"]
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["seller_application_status"]
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_daily_limits: {
        Row: {
          created_at: string
          daily_limit: number
          note: string | null
          seller_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          daily_limit: number
          note?: string | null
          seller_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          daily_limit?: number
          note?: string | null
          seller_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      seller_upload_audits: {
        Row: {
          category_id: string | null
          category_name: string | null
          created_at: string
          duplicates_already_replaced: number
          duplicates_in_file: number
          duplicates_in_stock: number
          file_name: string | null
          id: string
          invalid_rows: number
          over_limit_skipped: number
          rows_in_file: number
          rows_inserted: number
          rows_sent: number
          seller_id: string
          server_response: Json | null
          skip_duplicates_setting: boolean
        }
        Insert: {
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          duplicates_already_replaced?: number
          duplicates_in_file?: number
          duplicates_in_stock?: number
          file_name?: string | null
          id?: string
          invalid_rows?: number
          over_limit_skipped?: number
          rows_in_file?: number
          rows_inserted?: number
          rows_sent?: number
          seller_id: string
          server_response?: Json | null
          skip_duplicates_setting?: boolean
        }
        Update: {
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          duplicates_already_replaced?: number
          duplicates_in_file?: number
          duplicates_in_stock?: number
          file_name?: string | null
          id?: string
          invalid_rows?: number
          over_limit_skipped?: number
          rows_in_file?: number
          rows_inserted?: number
          rows_sent?: number
          seller_id?: string
          server_response?: Json | null
          skip_duplicates_setting?: boolean
        }
        Relationships: []
      }
      telegram_bot_sessions: {
        Row: {
          chat_id: number
          state: Json
          updated_at: string
        }
        Insert: {
          chat_id: number
          state?: Json
          updated_at?: string
        }
        Update: {
          chat_id?: number
          state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_deliveries: {
        Row: {
          attempt_count: number
          buyer_id: string
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          order_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["telegram_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          buyer_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          order_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["telegram_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          buyer_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          order_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["telegram_delivery_status"]
          updated_at?: string
        }
        Relationships: []
      }
      topup_requests: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          approved_at: string | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          screenshot_url: string | null
          sender_number: string
          source: string
          status: Database["public"]["Enums"]["topup_status"]
          txn_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_bdt: number
          approved_at?: string | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          sender_number: string
          source?: string
          status?: Database["public"]["Enums"]["topup_status"]
          txn_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_bdt?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          sender_number?: string
          source?: string
          status?: Database["public"]["Enums"]["topup_status"]
          txn_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdraw_requests: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          payout_txn_id: string | null
          receiver_number: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdraw_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_bdt: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          payout_txn_id?: string | null
          receiver_number: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdraw_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_bdt?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          payout_txn_id?: string | null
          receiver_number?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdraw_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_approve_seller_application: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_approve_topup: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_clear_seller_limit: { Args: { p_seller_id: string }; Returns: Json }
      admin_pay_withdraw: {
        Args: { p_id: string; p_note?: string; p_payout_txn: string }
        Returns: Json
      }
      admin_reject_seller_application: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_reject_topup: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_reject_withdraw: {
        Args: { p_id: string; p_note?: string }
        Returns: Json
      }
      admin_replace_with_category: {
        Args: {
          p_category_id: string
          p_item_id: string
          p_message?: string
          p_reason?: string
        }
        Returns: Json
      }
      admin_resolve_replacement_item: {
        Args: { p_action: string; p_item_id: string; p_reason?: string }
        Returns: Json
      }
      admin_save_brand_credit: {
        Args: {
          p_developer_name: string
          p_developer_url: string
          p_parent_brand: string
        }
        Returns: Json
      }
      admin_save_payment_accounts: {
        Args: { p_accounts: Json; p_min_deposit: Json }
        Returns: Json
      }
      admin_set_default_daily_limit: {
        Args: { p_limit: number }
        Returns: Json
      }
      admin_set_seller_limit: {
        Args: { p_daily_limit: number; p_note?: string; p_seller_id: string }
        Returns: Json
      }
      admin_stock_overview: {
        Args: never
        Returns: {
          available: number
          bad: number
          category_id: string
          category_name: string
          is_active: boolean
          price_bdt: number
          sold: number
          total: number
        }[]
      }
      admin_upsert_category: {
        Args: {
          p_description: string
          p_id: string
          p_is_active: boolean
          p_kind: Database["public"]["Enums"]["category_kind"]
          p_name: string
          p_price_bdt: number
          p_slug: string
          p_sort_order: number
        }
        Returns: Json
      }
      assign_seller_role_by_telegram: {
        Args: { p_telegram_username: string; p_user_id: string }
        Returns: undefined
      }
      bot_admin_approve_topup: {
        Args: { p_admin_chat_id: number; p_request_id: string }
        Returns: Json
      }
      bot_admin_reject_topup: {
        Args: { p_admin_chat_id: number; p_note?: string; p_request_id: string }
        Returns: Json
      }
      bot_admin_replace_with_category: {
        Args: {
          p_admin_chat_id: number
          p_category_slug: string
          p_item_id: string
          p_message?: string
        }
        Returns: Json
      }
      bot_buy_account: {
        Args: { p_category_id: string; p_telegram_chat_id: number }
        Returns: Json
      }
      bot_get_categories: {
        Args: never
        Returns: {
          available: number
          id: string
          name: string
          price_bdt: number
          slug: string
        }[]
      }
      bot_get_order_for_delivery: {
        Args: { p_order_id: string }
        Returns: Json
      }
      bot_get_profile: { Args: { p_telegram_chat_id: number }; Returns: Json }
      bot_submit_topup_request: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_screenshot_url: string
          p_sender_number: string
          p_telegram_chat_id: number
          p_txn_id: string
        }
        Returns: Json
      }
      bot_submit_topup_request_v2: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_screenshot_path: string
          p_sender_number: string
          p_telegram_chat_id: number
          p_txn_id: string
        }
        Returns: Json
      }
      clear_topup_screenshot: { Args: { p_id: string }; Returns: undefined }
      clear_topup_screenshot_path: {
        Args: { p_id: string }
        Returns: undefined
      }
      generate_tg_link_code: { Args: never; Returns: string }
      get_min_deposit: {
        Args: { p_method: Database["public"]["Enums"]["payment_method"] }
        Returns: number
      }
      get_my_seller_application: {
        Args: never
        Returns: {
          admin_note: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["seller_application_status"]
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_stock_counts: {
        Args: never
        Returns: {
          available: number
          category_id: string
        }[]
      }
      get_seller_daily_limit: { Args: { _seller_id: string }; Returns: number }
      get_seller_today_uploaded: {
        Args: { _seller_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_expired_topup_screenshot_paths: {
        Args: never
        Returns: {
          id: string
          screenshot_path: string
        }[]
      }
      list_expired_topup_screenshots: {
        Args: never
        Returns: {
          id: string
          screenshot_url: string
        }[]
      }
      log_audit_event: {
        Args: {
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_summary: string
        }
        Returns: undefined
      }
      place_order: {
        Args: { p_category_id: string; p_quantity: number }
        Returns: Json
      }
      seller_stock_overview: {
        Args: never
        Returns: {
          available: number
          bad: number
          category_id: string
          category_name: string
          sold: number
          total: number
        }[]
      }
      seller_upload_accounts: {
        Args: { p_category_id: string; p_rows: Json }
        Returns: Json
      }
      submit_replacement_request: {
        Args: { p_raw_input: string }
        Returns: Json
      }
      submit_seller_application: {
        Args: { p_reason: string; p_telegram_username: string }
        Returns: Json
      }
      submit_topup_request:
        | {
            Args: {
              p_amount: number
              p_method: Database["public"]["Enums"]["payment_method"]
              p_note?: string
              p_sender_number: string
              p_txn_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_method: Database["public"]["Enums"]["payment_method"]
              p_note?: string
              p_screenshot_url: string
              p_sender_number: string
              p_txn_id: string
            }
            Returns: Json
          }
      submit_topup_request_v2: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_screenshot_path: string
          p_sender_number: string
          p_txn_id: string
        }
        Returns: Json
      }
      submit_withdraw_request: {
        Args: {
          p_amount: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_receiver_number: string
        }
        Returns: Json
      }
    }
    Enums: {
      account_status:
        | "available"
        | "sold"
        | "replacement_pending"
        | "replaced"
        | "bad"
        | "withheld"
      app_role: "admin" | "seller" | "buyer"
      category_kind: "fb_account" | "vpn"
      ledger_kind:
        | "topup"
        | "purchase"
        | "refund"
        | "withdraw"
        | "admin_adjustment"
        | "seller_payout"
      notification_kind:
        | "replacement_filed"
        | "id_replaced"
        | "id_refunded"
        | "id_rejected"
        | "id_marked_bad"
        | "order_placed"
        | "stock_low"
        | "system"
      order_status: "pending" | "completed" | "failed" | "refunded"
      payment_method: "bkash" | "nagad" | "binance"
      replacement_item_outcome:
        | "pending"
        | "replaced"
        | "refunded"
        | "rejected"
        | "out_of_window"
        | "not_yours"
      replacement_status: "pending" | "processing" | "resolved" | "rejected"
      seller_application_status: "pending" | "approved" | "rejected"
      telegram_delivery_status: "pending" | "sending" | "sent" | "failed"
      topup_status: "pending" | "approved" | "rejected"
      withdraw_status: "pending" | "approved" | "paid" | "rejected"
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
      account_status: [
        "available",
        "sold",
        "replacement_pending",
        "replaced",
        "bad",
        "withheld",
      ],
      app_role: ["admin", "seller", "buyer"],
      category_kind: ["fb_account", "vpn"],
      ledger_kind: [
        "topup",
        "purchase",
        "refund",
        "withdraw",
        "admin_adjustment",
        "seller_payout",
      ],
      notification_kind: [
        "replacement_filed",
        "id_replaced",
        "id_refunded",
        "id_rejected",
        "id_marked_bad",
        "order_placed",
        "stock_low",
        "system",
      ],
      order_status: ["pending", "completed", "failed", "refunded"],
      payment_method: ["bkash", "nagad", "binance"],
      replacement_item_outcome: [
        "pending",
        "replaced",
        "refunded",
        "rejected",
        "out_of_window",
        "not_yours",
      ],
      replacement_status: ["pending", "processing", "resolved", "rejected"],
      seller_application_status: ["pending", "approved", "rejected"],
      telegram_delivery_status: ["pending", "sending", "sent", "failed"],
      topup_status: ["pending", "approved", "rejected"],
      withdraw_status: ["pending", "approved", "paid", "rejected"],
    },
  },
} as const
