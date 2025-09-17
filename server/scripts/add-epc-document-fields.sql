-- Migration script to add EPC document storage fields
-- Run this script to add the missing EPC document fields

-- Add EPC document fields
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS epc_document_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS epc_document_url TEXT;

-- Add indexes for better performance  
CREATE INDEX IF NOT EXISTS idx_properties_epc_document_name ON properties(epc_document_name);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'properties' 
AND column_name IN ('epc_document_name', 'epc_document_url')
ORDER BY column_name;
