#!/bin/bash

# Database backup script for Property Management System
# This script creates a backup of the PostgreSQL database

# Set database connection parameters
DB_HOST="localhost"
DB_USER="fatemehrahimi"
DB_NAME="propertydb"

# Create backup directory if it doesn't exist
mkdir -p backups

# Generate timestamp for backup filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/propertydb_backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="backups/propertydb_backup_${TIMESTAMP}.sql.gz"

echo "Starting database backup..."
echo "Database: $DB_NAME"
echo "Backup file: $BACKUP_FILE"

# Create the backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --no-password > $BACKUP_FILE

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "✅ Database backup created successfully!"
    
    # Compress the backup
    gzip -c $BACKUP_FILE > $COMPRESSED_FILE
    echo "✅ Compressed backup created: $COMPRESSED_FILE"
    
    # Show file sizes
    echo ""
    echo "Backup files created:"
    ls -lh $BACKUP_FILE $COMPRESSED_FILE
    
    # Optional: Remove uncompressed file to save space
    # Uncomment the next line if you want to keep only the compressed version
    # rm $BACKUP_FILE
    
    echo ""
    echo "🎉 Backup completed successfully!"
    echo "To restore this backup, use:"
    echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME < $BACKUP_FILE"
    
else
    echo "❌ Database backup failed!"
    exit 1
fi 