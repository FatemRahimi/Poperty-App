#!/bin/bash

# Database backup script
DB_NAME="propertydb"
DB_USER="fatemehrahimi"
BACKUP_DIR="$HOME/database_backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Creating backup of $DB_NAME..."
pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_DIR/propertydb_backup_$DATE.sql"

# Compress the backup
gzip "$BACKUP_DIR/propertydb_backup_$DATE.sql"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "propertydb_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/propertydb_backup_$DATE.sql.gz" 