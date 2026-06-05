/**
 * Hand-authored types for the tables and RPCs this phase touches (content
 * layer + ingestion). Regenerate the full set later with:
 *   supabase gen types typescript --project-id <ref> > lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type DeckVisibility = 'private' | 'unlisted' | 'public'
export type QuestionType = 'mcq' | 'ordered_steps' | 'term' | 'short_answer'
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      decks: {
        Row: {
          id: string
          owner_id: string
          title: string
          description: string | null
          visibility: DeckVisibility
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          description?: string | null
          visibility?: DeckVisibility
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          description?: string | null
          visibility?: DeckVisibility
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          deck_id: string
          filename: string
          storage_path: string
          mime_type: string | null
          status: DocumentStatus
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          filename: string
          storage_path: string
          mime_type?: string | null
          status?: DocumentStatus
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          filename?: string
          storage_path?: string
          mime_type?: string | null
          status?: DocumentStatus
          error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      chunks: {
        Row: {
          id: string
          document_id: string
          deck_id: string
          ord: number
          content: string
          embedding: string | null
          source_loc: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          deck_id: string
          ord: number
          content: string
          embedding?: string | number[] | null
          source_loc?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          deck_id?: string
          ord?: number
          content?: string
          embedding?: string | number[] | null
          source_loc?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      concepts: {
        Row: {
          id: string
          deck_id: string
          name: string
          description: string | null
          parent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          name: string
          description?: string | null
          parent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          name?: string
          description?: string | null
          parent_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          deck_id: string
          type: QuestionType
          prompt: string
          payload: Json
          answer: Json
          explanation: string | null
          source_chunk_ids: string[]
          verified: boolean
          difficulty: number | null
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          type: QuestionType
          prompt: string
          payload?: Json
          answer?: Json
          explanation?: string | null
          source_chunk_ids?: string[]
          verified?: boolean
          difficulty?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          type?: QuestionType
          prompt?: string
          payload?: Json
          answer?: Json
          explanation?: string | null
          source_chunk_ids?: string[]
          verified?: boolean
          difficulty?: number | null
          created_at?: string
        }
        Relationships: []
      }
      question_concepts: {
        Row: { question_id: string; concept_id: string }
        Insert: { question_id: string; concept_id: string }
        Update: { question_id?: string; concept_id?: string }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      match_chunks: {
        Args: {
          p_deck_id: string
          p_query_embedding: string
          p_match_count: number
        }
        Returns: {
          id: string
          content: string
          source_loc: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      deck_visibility: DeckVisibility
      question_type: QuestionType
      document_status: DocumentStatus
    }
    CompositeTypes: Record<never, never>
  }
}
