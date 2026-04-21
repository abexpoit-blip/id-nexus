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
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_banned: boolean
          telegram_chat_id: number | null
          telegram_link_code: string
          updated_at: string
        }
        Insert: {
          balance_bdt?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_banned?: boolean
          telegram_chat_id?: number | null
          telegram_link_code: string
          updated_at?: string
        }
        Update: {
          balance_bdt?: number
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_banned?: boolean
          telegram_chat_id?: number | null
          telegram_link_code?: string
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_tg_link_code: { Args: never; Returns: string }
      get_public_stock_counts: {
        Args: never
        Returns: {
          available: number
          category_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_order: {
        Args: { p_category_id: string; p_quantity: number }
        Returns: Json
      }
      seller_upload_accounts: {
        Args: { p_category_id: string; p_rows: Json }
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
      order_status: "pending" | "completed" | "failed" | "refunded"
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
      order_status: ["pending", "completed", "failed", "refunded"],
    },
  },
} as const
