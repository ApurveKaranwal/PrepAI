import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database

def main():
    # Fetch from up to 8 random companies for a manual CLI trigger
    database.run_jobs_fetch(companies_limit=8)

if __name__ == "__main__":
    main()
