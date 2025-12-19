-- Migration: 003_add_epc_document_fields.sql
-- Description: Add EPC document storage fields
-- Date: Initial migration
-- Dependencies: 002

-- Add EPC document fields
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS epc_document_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS epc_document_url TEXT;

-- Add indexes for better performance  
CREATE INDEX IF NOT EXISTS idx_properties_epc_document_name ON properties(epc_document_name);

