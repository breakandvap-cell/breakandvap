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
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string | null
          postal_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          postal_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          postal_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_action_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
      invoice_counters: {
        Row: {
          last_number: number
          updated_at: string
          year: number
        }
        Insert: {
          last_number?: number
          updated_at?: string
          year: number
        }
        Update: {
          last_number?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          buyer: Json
          created_at: string
          currency: string
          id: string
          issued_at: string
          items: Json
          number: string
          order_id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          seller: Json
          sequence: number
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          year: number
        }
        Insert: {
          buyer: Json
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          items: Json
          number: string
          order_id: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          seller: Json
          sequence: number
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at?: string
          year: number
        }
        Update: {
          buyer?: Json
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          items?: Json
          number?: string
          order_id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          seller?: Json
          sequence?: number
          subtotal_cents?: number
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          base_price_cents: number | null
          booster_unit_price_cents: number | null
          boosters_count: number
          created_at: string
          flavor: string | null
          id: string
          nicotine_mg: number | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
          volume_ml: number | null
        }
        Insert: {
          base_price_cents?: number | null
          booster_unit_price_cents?: number | null
          boosters_count?: number
          created_at?: string
          flavor?: string | null
          id?: string
          nicotine_mg?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
          volume_ml?: number | null
        }
        Update: {
          base_price_cents?: number | null
          booster_unit_price_cents?: number | null
          boosters_count?: number
          created_at?: string
          flavor?: string | null
          id?: string
          nicotine_mg?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_cents?: number
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          guest_email: string | null
          id: string
          order_number: string
          paid_at: string | null
          payment_provider: string | null
          payment_transaction_id: string | null
          shipped_at: string | null
          shipping_address: Json
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          tracking_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          guest_email?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_transaction_id?: string | null
          shipped_at?: string | null
          shipping_address: Json
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          guest_email?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_transaction_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          available_nicotine_mg: number[]
          boosters_per_nicotine: Json
          created_at: string
          id: string
          max_boosters: number | null
          max_nicotine_mg: number | null
          nicotine_type: string
          photo_url: string | null
          price_cents: number
          product_id: string
          stock: number
          updated_at: string
          volume_ml: number
        }
        Insert: {
          available_nicotine_mg?: number[]
          boosters_per_nicotine?: Json
          created_at?: string
          id?: string
          max_boosters?: number | null
          max_nicotine_mg?: number | null
          nicotine_type?: string
          photo_url?: string | null
          price_cents: number
          product_id: string
          stock?: number
          updated_at?: string
          volume_ml: number
        }
        Update: {
          available_nicotine_mg?: number[]
          boosters_per_nicotine?: Json
          created_at?: string
          id?: string
          max_boosters?: number | null
          max_nicotine_mg?: number | null
          nicotine_type?: string
          photo_url?: string | null
          price_cents?: number
          product_id?: string
          stock?: number
          updated_at?: string
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          booster_product_id: string | null
          booster_type: string | null
          category: Database["public"]["Enums"]["product_category"]
          cbd_percent: number | null
          coa_url: string | null
          created_at: string
          currency: string
          description: string | null
          empty_bottle_product_id: string | null
          flavors: Json
          health_warnings: string | null
          id: string
          is_nicotine_booster: boolean
          is_published: boolean
          name: string
          nicotine_mg: number | null
          photos: string[]
          price_cents: number
          slug: string
          stock: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          subcategory: string | null
          thc_percent: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booster_product_id?: string | null
          booster_type?: string | null
          category: Database["public"]["Enums"]["product_category"]
          cbd_percent?: number | null
          coa_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          empty_bottle_product_id?: string | null
          flavors?: Json
          health_warnings?: string | null
          id?: string
          is_nicotine_booster?: boolean
          is_published?: boolean
          name: string
          nicotine_mg?: number | null
          photos?: string[]
          price_cents: number
          slug: string
          stock?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory?: string | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booster_product_id?: string | null
          booster_type?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          cbd_percent?: number | null
          coa_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          empty_bottle_product_id?: string | null
          flavors?: Json
          health_warnings?: string | null
          id?: string
          is_nicotine_booster?: boolean
          is_published?: boolean
          name?: string
          nicotine_mg?: number | null
          photos?: string[]
          price_cents?: number
          slug?: string
          stock?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory?: string | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_booster_product_id_fkey"
            columns: ["booster_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_empty_bottle_product_id_fkey"
            columns: ["empty_bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_verification_status: Database["public"]["Enums"]["age_verification_status"]
          age_verified_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          age_verification_status?: Database["public"]["Enums"]["age_verification_status"]
          age_verified_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          age_verification_status?: Database["public"]["Enums"]["age_verification_status"]
          age_verified_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
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
      create_invoice_for_order: {
        Args: {
          _buyer: Json
          _currency: string
          _items: Json
          _order_id: string
          _seller: Json
          _subtotal_cents: number
          _tax_cents: number
          _tax_rate: number
          _total_cents: number
        }
        Returns: {
          buyer: Json
          created_at: string
          currency: string
          id: string
          issued_at: string
          items: Json
          number: string
          order_id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          seller: Json
          sequence: number
          subtotal_cents: number
          tax_cents: number
          tax_rate: number
          total_cents: number
          updated_at: string
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      age_verification_status:
        | "non_verifie"
        | "en_attente"
        | "verifie"
        | "refuse"
      app_role: "client" | "admin"
      order_status: "a_preparer" | "expediee" | "livree" | "annulee"
      product_category:
        | "cbd"
        | "e_liquide"
        | "accessoire"
        | "accessoire_vape"
        | "accessoire_cbd"
      stock_status: "in_stock" | "low_stock" | "out_of_stock"
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
      age_verification_status: [
        "non_verifie",
        "en_attente",
        "verifie",
        "refuse",
      ],
      app_role: ["client", "admin"],
      order_status: ["a_preparer", "expediee", "livree", "annulee"],
      product_category: [
        "cbd",
        "e_liquide",
        "accessoire",
        "accessoire_vape",
        "accessoire_cbd",
      ],
      stock_status: ["in_stock", "low_stock", "out_of_stock"],
    },
  },
} as const
