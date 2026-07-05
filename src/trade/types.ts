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
  | 'farm'
  | 'postOffice'
  | 'dock';

export interface TradeOffer {
  id: string;
  itemId: string;
  name: string;
  description: string;
  localeName: {
    en: string;
    zh: string;
  };
  localeDescription: {
    en: string;
    zh: string;
  };
  iconKey: string;
  buyPrice: number;
  sellPrice: number;
  category: 'food' | 'service' | 'item' | 'information' | 'material' | 'crop';
  acceptedBy: VendorType[];
  maxStack?: number;
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

export interface TradeTransaction {
  vendorAgentId: string;
  itemId: string;
  quantity: number;
  direction: 'buy' | 'sell';
}

export interface TradeResult {
  ok: boolean;
  message: string;
  profile?: TradeProfile;
  selectedOffer?: TradeOffer;
}
