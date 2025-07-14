import pandas as pd
from datetime import datetime
import os

def change_year_in_csv(file_path, column_name, new_year, output_path=None):
    """
    Changes the year in a datetime column of a CSV file to a specified year.
    
    Args:
        file_path (str): Path to the CSV file
        column_name (str): Name of the column containing datetime values
        new_year (int): The year to change all dates to
        output_path (str): Path for output file (optional, defaults to original file with '_updated' suffix)
    """
    
    try:
        # Read the CSV file
        print(f"Reading CSV file: {file_path}")
        df = pd.read_csv(file_path)
        
        # Check if column exists
        if column_name not in df.columns:
            print(f"Error: Column '{column_name}' not found in the CSV.")
            print(f"Available columns: {list(df.columns)}")
            return
        
        # Convert column to datetime if it's not already
        df[column_name] = pd.to_datetime(df[column_name], errors='coerce')
        
        # Count non-null datetime values before processing
        valid_dates_before = df[column_name].notna().sum()
        print(f"Found {valid_dates_before} valid datetime values in column '{column_name}'")
        
        # Function to change year while preserving month and day
        def change_year(date_val):
            if pd.isna(date_val):
                return date_val
            try:
                # Handle leap year edge case (Feb 29)
                if date_val.month == 2 and date_val.day == 29:
                    # Check if new year is leap year
                    if not ((new_year % 4 == 0 and new_year % 100 != 0) or (new_year % 400 == 0)):
                        # Not a leap year, change to Feb 28
                        return date_val.replace(year=new_year, day=28)
                
                return date_val.replace(year=new_year)
            except Exception as e:
                print(f"Error processing date {date_val}: {e}")
                return date_val
        
        # Apply year change to the column
        df[column_name] = df[column_name].apply(change_year)
        
        # Count valid dates after processing
        valid_dates_after = df[column_name].notna().sum()
        print(f"Successfully processed {valid_dates_after} datetime values")
        
        # Determine output file path
        if output_path is None:
            file_dir = os.path.dirname(file_path)
            file_name = os.path.splitext(os.path.basename(file_path))[0]
            output_path = os.path.join(file_dir, f"{file_name}_updated.csv")
        
        # Format the datetime column to the desired format (ISO format with T)
        df[column_name] = df[column_name].dt.strftime('%Y-%m-%dT%H:%M:%S')
        
        # Save the updated CSV file
        print(f"Saving updated file to: {output_path}")
        df.to_csv(output_path, index=False)
        
        print(f"Successfully updated all dates in column '{column_name}' to year {new_year}")
        print(f"Updated file saved as: {output_path}")
        
        return df
        
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
    except Exception as e:
        print(f"Error: {str(e)}")

# Configuration - Edit these values manually
if __name__ == "__main__":
    # EDIT THESE VALUES:
    file_path = "./harareweather2.csv"          # Path to your CSV file
    column_name = "sunset"            # Name of the datetime column
    new_year = 2024                 # Year to change all dates to
    output_path = None              # Optional: specify output file path (None for auto-generated)
    
    # Run the function
    change_year_in_csv(file_path, column_name, new_year, output_path)