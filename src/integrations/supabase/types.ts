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
      admin_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_mfa_grants: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalogue_produits_staging: {
        Row: {
          brand: string | null
          cannabinoid_profile: string | null
          category: string
          is_publishable: boolean
          manufacturer: string | null
          name: string
          nicotine_mg_ml: number | null
          product_type: string
          quantity: number
          range_name: string | null
          raw_name: string
          resistance_ohm: number | null
          review_reason: string | null
          slug: string
          source_id: number
          source_title: string | null
          source_url: string | null
          subcategory: string
          updated_at: string
          value_ht: number | null
          value_ttc: number | null
          verification_status: string
          volume_ml: number | null
        }
        Insert: {
          brand?: string | null
          cannabinoid_profile?: string | null
          category: string
          is_publishable?: boolean
          manufacturer?: string | null
          name: string
          nicotine_mg_ml?: number | null
          product_type: string
          quantity?: number
          range_name?: string | null
          raw_name: string
          resistance_ohm?: number | null
          review_reason?: string | null
          slug: string
          source_id: number
          source_title?: string | null
          source_url?: string | null
          subcategory: string
          updated_at?: string
          value_ht?: number | null
          value_ttc?: number | null
          verification_status: string
          volume_ml?: number | null
        }
        Update: {
          brand?: string | null
          cannabinoid_profile?: string | null
          category?: string
          is_publishable?: boolean
          manufacturer?: string | null
          name?: string
          nicotine_mg_ml?: number | null
          product_type?: string
          quantity?: number
          range_name?: string | null
          raw_name?: string
          resistance_ohm?: number | null
          review_reason?: string | null
          slug?: string
          source_id?: number
          source_title?: string | null
          source_url?: string | null
          subcategory?: string
          updated_at?: string
          value_ht?: number | null
          value_ttc?: number | null
          verification_status?: string
          volume_ml?: number | null
        }
        Relationships: []
      }
      custom_mix_flavors: {
        Row: {
          created_at: string
          custom_mix_id: string
          flavor_product_id: string
          id: string
          percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_mix_id: string
          flavor_product_id: string
          id?: string
          percentage: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_mix_id?: string
          flavor_product_id?: string
          id?: string
          percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_mix_flavors_custom_mix_id_fkey"
            columns: ["custom_mix_id"]
            isOneToOne: false
            referencedRelation: "custom_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_mix_flavors_flavor_product_id_fkey"
            columns: ["flavor_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_mix_flavors_flavor_product_id_fkey"
            columns: ["flavor_product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_mixes: {
        Row: {
          bottle_product_id: string | null
          created_at: string
          id: string
          nicotine_mg: number
          price_cents: number | null
          session_id: string | null
          status: Database["public"]["Enums"]["custom_mix_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bottle_product_id?: string | null
          created_at?: string
          id?: string
          nicotine_mg?: number
          price_cents?: number | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["custom_mix_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bottle_product_id?: string | null
          created_at?: string
          id?: string
          nicotine_mg?: number
          price_cents?: number | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["custom_mix_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_mixes_bottle_product_id_fkey"
            columns: ["bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_mixes_bottle_product_id_fkey"
            columns: ["bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      gammes: {
        Row: {
          created_at: string
          id: string
          marque: string
          nom: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marque: string
          nom: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marque?: string
          nom?: string
          updated_at?: string
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
          variant_sku: string | null
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
          variant_sku?: string | null
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
          variant_sku?: string | null
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
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          guest_email: string | null
          id: string
          order_number: string
          paid_at: string | null
          payment_provider: string | null
          payment_transaction_id: string | null
          refund_processed_at: string | null
          shipped_at: string | null
          shipping_address: Json
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          tracking_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          guest_email?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_transaction_id?: string | null
          refund_processed_at?: string | null
          shipped_at?: string | null
          shipping_address: Json
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          guest_email?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_transaction_id?: string | null
          refund_processed_at?: string | null
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
          empty_bottle_product_id: string | null
          id: string
          is_active: boolean
          max_boosters: number | null
          max_nicotine_mg: number | null
          nicotine_type: string
          photo_url: string | null
          price_cents: number
          product_id: string
          quantity_tiers: Json
          sku: string | null
          stock: number
          updated_at: string
          volume_ml: number
        }
        Insert: {
          available_nicotine_mg?: number[]
          boosters_per_nicotine?: Json
          created_at?: string
          empty_bottle_product_id?: string | null
          id?: string
          is_active?: boolean
          max_boosters?: number | null
          max_nicotine_mg?: number | null
          nicotine_type?: string
          photo_url?: string | null
          price_cents: number
          product_id: string
          quantity_tiers?: Json
          sku?: string | null
          stock?: number
          updated_at?: string
          volume_ml: number
        }
        Update: {
          available_nicotine_mg?: number[]
          boosters_per_nicotine?: Json
          created_at?: string
          empty_bottle_product_id?: string | null
          id?: string
          is_active?: boolean
          max_boosters?: number | null
          max_nicotine_mg?: number | null
          nicotine_type?: string
          photo_url?: string | null
          price_cents?: number
          product_id?: string
          quantity_tiers?: Json
          sku?: string | null
          stock?: number
          updated_at?: string
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_empty_bottle_product_id_fkey"
            columns: ["empty_bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_empty_bottle_product_id_fkey"
            columns: ["empty_bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          booster_product_id: string | null
          booster_type: string | null
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          cbd_percent: number | null
          coa_url: string | null
          country_of_origin: string | null
          created_at: string
          currency: string
          description: string | null
          empty_bottle_product_id: string | null
          flavor_type: string | null
          flavors: Json
          gamme_id: string | null
          health_warnings: string | null
          id: string
          is_nicotine_booster: boolean
          is_published: boolean
          low_stock_notified_at: string | null
          name: string
          nicotine_mg: number | null
          pg_vg_ratio: string | null
          photos: string[]
          price_cents: number
          product_range: string | null
          range_name: string | null
          slug: string
          stock: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          subcategory: string | null
          thc_percent: number | null
          updated_at: string
          updated_by: string | null
          volume_ml: number | null
        }
        Insert: {
          booster_product_id?: string | null
          booster_type?: string | null
          brand?: string | null
          category: Database["public"]["Enums"]["product_category"]
          cbd_percent?: number | null
          coa_url?: string | null
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          empty_bottle_product_id?: string | null
          flavor_type?: string | null
          flavors?: Json
          gamme_id?: string | null
          health_warnings?: string | null
          id?: string
          is_nicotine_booster?: boolean
          is_published?: boolean
          low_stock_notified_at?: string | null
          name: string
          nicotine_mg?: number | null
          pg_vg_ratio?: string | null
          photos?: string[]
          price_cents: number
          product_range?: string | null
          range_name?: string | null
          slug: string
          stock?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory?: string | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number | null
        }
        Update: {
          booster_product_id?: string | null
          booster_type?: string | null
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          cbd_percent?: number | null
          coa_url?: string | null
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          empty_bottle_product_id?: string | null
          flavor_type?: string | null
          flavors?: Json
          gamme_id?: string | null
          health_warnings?: string | null
          id?: string
          is_nicotine_booster?: boolean
          is_published?: boolean
          low_stock_notified_at?: string | null
          name?: string
          nicotine_mg?: number | null
          pg_vg_ratio?: string | null
          photos?: string[]
          price_cents?: number
          product_range?: string | null
          range_name?: string | null
          slug?: string
          stock?: number
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory?: string | null
          thc_percent?: number | null
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number | null
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
            foreignKeyName: "products_booster_product_id_fkey"
            columns: ["booster_product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_empty_bottle_product_id_fkey"
            columns: ["empty_bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_empty_bottle_product_id_fkey"
            columns: ["empty_bottle_product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_gamme_id_fkey"
            columns: ["gamme_id"]
            isOneToOne: false
            referencedRelation: "gammes"
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
      promotions: {
        Row: {
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          scope: Database["public"]["Enums"]["promotion_scope"]
          scope_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          scope?: Database["public"]["Enums"]["promotion_scope"]
          scope_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          scope?: Database["public"]["Enums"]["promotion_scope"]
          scope_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      shop_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      shop_subcategories: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "shop_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          booster_concentration_mg_per_ml: number
          booster_volume_ml: number
          created_at: string
          default_booster_ice_id: string | null
          default_booster_normale_id: string | null
          default_booster_sel_id: string | null
          general_wheel_enabled: boolean
          singleton: boolean
          updated_at: string
          welcome_wheel_enabled: boolean
        }
        Insert: {
          booster_concentration_mg_per_ml?: number
          booster_volume_ml?: number
          created_at?: string
          default_booster_ice_id?: string | null
          default_booster_normale_id?: string | null
          default_booster_sel_id?: string | null
          general_wheel_enabled?: boolean
          singleton?: boolean
          updated_at?: string
          welcome_wheel_enabled?: boolean
        }
        Update: {
          booster_concentration_mg_per_ml?: number
          booster_volume_ml?: number
          created_at?: string
          default_booster_ice_id?: string | null
          default_booster_normale_id?: string | null
          default_booster_sel_id?: string | null
          general_wheel_enabled?: boolean
          singleton?: boolean
          updated_at?: string
          welcome_wheel_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_default_booster_ice_id_fkey"
            columns: ["default_booster_ice_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_default_booster_ice_id_fkey"
            columns: ["default_booster_ice_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_default_booster_normale_id_fkey"
            columns: ["default_booster_normale_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_default_booster_normale_id_fkey"
            columns: ["default_booster_normale_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_default_booster_sel_id_fkey"
            columns: ["default_booster_sel_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_default_booster_sel_id_fkey"
            columns: ["default_booster_sel_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_notifications: {
        Row: {
          channel: Database["public"]["Enums"]["stock_notification_channel"]
          created_at: string
          email: string | null
          id: string
          notified_at: string | null
          phone: string | null
          product_id: string
          status: Database["public"]["Enums"]["stock_notification_status"]
          updated_at: string
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["stock_notification_channel"]
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          phone?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["stock_notification_status"]
          updated_at?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["stock_notification_channel"]
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          phone?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["stock_notification_status"]
          updated_at?: string
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_brand_range_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_notifications_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          created_at: string
          id: string
          imported_at: string
          imported_by: string | null
          invoice_norm: string | null
          invoice_number: string
          lines_total: number
          supplier: string
          supplier_norm: string | null
          updated_at: string
          updated_variants: number
        }
        Insert: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          invoice_norm?: string | null
          invoice_number: string
          lines_total?: number
          supplier: string
          supplier_norm?: string | null
          updated_at?: string
          updated_variants?: number
        }
        Update: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          invoice_norm?: string | null
          invoice_number?: string
          lines_total?: number
          supplier?: string
          supplier_norm?: string | null
          updated_at?: string
          updated_variants?: number
        }
        Relationships: []
      }
      supplier_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          supplier: string
          supplier_label: string | null
          supplier_ref: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          supplier: string
          supplier_label?: string | null
          supplier_ref?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          supplier?: string
          supplier_label?: string | null
          supplier_ref?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_mappings_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          is_featured: boolean
          rating: number | null
          review_date: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          is_featured?: boolean
          rating?: number | null
          review_date?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          is_featured?: boolean
          rating?: number | null
          review_date?: string | null
          sort_order?: number
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
      wheel_prizes: {
        Row: {
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          label: string
          updated_at: string
          weight: number
          wheel_type: Database["public"]["Enums"]["wheel_type"]
        }
        Insert: {
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
          weight?: number
          wheel_type: Database["public"]["Enums"]["wheel_type"]
        }
        Update: {
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          weight?: number
          wheel_type?: Database["public"]["Enums"]["wheel_type"]
        }
        Relationships: []
      }
      wheel_spins: {
        Row: {
          created_at: string
          discount_amount_cents: number
          expires_at: string
          id: string
          order_id: string | null
          prize_id: string | null
          status: Database["public"]["Enums"]["wheel_spin_status"]
          updated_at: string
          user_id: string
          wheel_type: Database["public"]["Enums"]["wheel_type"]
        }
        Insert: {
          created_at?: string
          discount_amount_cents?: number
          expires_at?: string
          id?: string
          order_id?: string | null
          prize_id?: string | null
          status?: Database["public"]["Enums"]["wheel_spin_status"]
          updated_at?: string
          user_id: string
          wheel_type: Database["public"]["Enums"]["wheel_type"]
        }
        Update: {
          created_at?: string
          discount_amount_cents?: number
          expires_at?: string
          id?: string
          order_id?: string | null
          prize_id?: string | null
          status?: Database["public"]["Enums"]["wheel_spin_status"]
          updated_at?: string
          user_id?: string
          wheel_type?: Database["public"]["Enums"]["wheel_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wheel_spins_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wheel_spins_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "wheel_prizes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      products_brand_range_audit: {
        Row: {
          brand: string | null
          category: Database["public"]["Enums"]["product_category"] | null
          classement: string | null
          id: string | null
          name: string | null
          range_name: string | null
        }
        Insert: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"] | null
          classement?: never
          id?: string | null
          name?: string | null
          range_name?: string | null
        }
        Update: {
          brand?: string | null
          category?: Database["public"]["Enums"]["product_category"] | null
          classement?: never
          id?: string | null
          name?: string | null
          range_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_custom_mix_complete: {
        Args: { _mix_id: string }
        Returns: undefined
      }
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
      decrement_flavor_stock: {
        Args: { _flavor: string; _product_id: string; _qty: number }
        Returns: number
      }
      decrement_product_stock: {
        Args: { _id: string; _qty: number }
        Returns: number
      }
      decrement_variant_stock: {
        Args: { _id: string; _qty: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_flavor_stock: {
        Args: { _flavor: string; _product_id: string; _qty: number }
        Returns: undefined
      }
      increment_product_stock: {
        Args: { _id: string; _qty: number }
        Returns: number
      }
      increment_variant_stock: {
        Args: { _id: string; _qty: number }
        Returns: number
      }
      search_products: {
        Args: { search_term: string }
        Returns: {
          booster_product_id: string | null
          booster_type: string | null
          brand: string | null
          category: Database["public"]["Enums"]["product_category"]
          cbd_percent: number | null
          coa_url: string | null
          country_of_origin: string | null
          created_at: string
          currency: string
          description: string | null
          empty_bottle_product_id: string | null
          flavor_type: string | null
          flavors: Json
          gamme_id: string | null
          health_warnings: string | null
          id: string
          is_nicotine_booster: boolean
          is_published: boolean
          low_stock_notified_at: string | null
          name: string
          nicotine_mg: number | null
          pg_vg_ratio: string | null
          photos: string[]
          price_cents: number
          product_range: string | null
          range_name: string | null
          slug: string
          stock: number
          stock_status: Database["public"]["Enums"]["stock_status"]
          subcategory: string | null
          thc_percent: number | null
          updated_at: string
          updated_by: string | null
          volume_ml: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      age_verification_status:
        | "non_verifie"
        | "en_attente"
        | "verifie"
        | "refuse"
      app_role: "client" | "admin"
      custom_mix_status: "draft" | "validated" | "added_to_cart" | "ordered"
      discount_type: "percentage" | "fixed_amount"
      order_status: "a_preparer" | "expediee" | "livree" | "annulee"
      product_category:
        | "cbd"
        | "e_liquide"
        | "accessoire"
        | "accessoire_vape"
        | "accessoire_cbd"
      promotion_scope: "site" | "category" | "product"
      stock_notification_channel: "email" | "sms" | "both"
      stock_notification_status: "pending" | "sent" | "cancelled"
      stock_status: "in_stock" | "low_stock" | "out_of_stock"
      wheel_spin_status: "pending" | "used" | "expired"
      wheel_type: "welcome" | "general"
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
      custom_mix_status: ["draft", "validated", "added_to_cart", "ordered"],
      discount_type: ["percentage", "fixed_amount"],
      order_status: ["a_preparer", "expediee", "livree", "annulee"],
      product_category: [
        "cbd",
        "e_liquide",
        "accessoire",
        "accessoire_vape",
        "accessoire_cbd",
      ],
      promotion_scope: ["site", "category", "product"],
      stock_notification_channel: ["email", "sms", "both"],
      stock_notification_status: ["pending", "sent", "cancelled"],
      stock_status: ["in_stock", "low_stock", "out_of_stock"],
      wheel_spin_status: ["pending", "used", "expired"],
      wheel_type: ["welcome", "general"],
    },
  },
} as const
