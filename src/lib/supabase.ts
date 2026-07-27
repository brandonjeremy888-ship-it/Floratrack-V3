import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'floratrack-auth',
  },
});

export type Stratification = {
  method: string;
  status: string;
  startDate: string;
};

export type Planting = {
  method: string;
  soilMix: string;
  potType: string;
};

export type Treatment = {
  id: string;
  batch_id: string;
  date: string;
  type: string;
  notes: string;
};

export type Outplanting = {
  id: string;
  batch_id: string;
  date: string;
  destination: string;
  qty: number;
};

export type Flag = {
  id: string;
  batch_id: string;
  message: string;
};

export type Batch = {
  id: string;
  parent_id: string | null;
  species: string;
  common_name: string;
  collection_type: string;
  collection_date: string;
  source_location: string;
  initial_qty: number;
  current_qty: number;
  status: string;
  nursery_location: string;
  seed_weight_oz?: number; 
  collector_name?: string;
  field_notes?: string;
  habitat_type?: string;
  habitat_quality?: string;
  source_plant_count?: number;
  collection_lat?: number;
  collection_lng?: number;
  collected_container_count?: number;
  collected_container_type?: string;
  container_size_note?: string;
  collected_weight_lbs?: number;
  processed_weight_lbs?: number;
  estimated_seed_count?: number;
  photo_urls?: string;
  agol_collection_id?: string;
  stratification: Stratification;
  planting: Planting;
  treatments: Treatment[];
  outplantings: Outplanting[];
  flags: Flag[];
};

export type BatchRow = {
  id: string;
  parent_id: string | null;
  species: string;
  common_name: string;
  collection_type: string;
  collection_date: string;
  source_location: string;
  initial_qty: number;
  current_qty: number;
  status: string;
  nursery_location: string;
  seed_weight_oz?: number;
  collector_name?: string;
  field_notes?: string;
  habitat_type?: string;
  habitat_quality?: string;
  source_plant_count?: number;
  collection_lat?: number;
  collection_lng?: number;
  collected_container_count?: number;
  collected_container_type?: string;
  container_size_note?: string;
  collected_weight_lbs?: number;
  processed_weight_lbs?: number;
  estimated_seed_count?: number;
  photo_urls?: string;
  agol_collection_id?: string;
  stratification: Stratification;
  planting: Planting;
};

export const STATUS_OPTIONS = [
  'Collected/Stored',
  'Propagating',
  'Growing',
  'Ready',
  'Outplanted',
  'Failed',
] as const;
