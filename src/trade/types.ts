import type { LocationId } from '../data/locations';

export type VendorType =
  | 'cafe'
  | 'restaurant'
  | 'clinic'
  | 'library'
  | 'school'
  | 'studio'
  | 'workshop'
  | 'grocery'
  | 'bakery'
  | 'inn'
  | 'museum'
  | 'postOffice'
  | 'dock';

export interface TradeOffer {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'food' | 'service' | 'item' | 'information';
}

export interface TradeProfile {
  enabled: boolean;
  vendorType: VendorType;
  displayName: string;
  locationId: LocationId;
  offers: TradeOffer[];
}

export interface TradeRequest {
  buyerId: string;
  vendorAgentId: string;
  offerId?: string;
}

export interface TradeResult {
  ok: boolean;
  message: string;
  profile?: TradeProfile;
  selectedOffer?: TradeOffer;
}
