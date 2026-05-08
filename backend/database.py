import os
import json
import uuid
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# MongoDB configuration - local or remote Atlas
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "fabricguard")

class MockCollection:
    def __init__(self, filename, collection_name):
        self.filename = filename
        self.collection_name = collection_name

    def _read_data(self):
        if not os.path.exists(self.filename):
            return []
        try:
            with open(self.filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get(self.collection_name, [])
        except Exception:
            return []

    def _write_data(self, items):
        data = {}
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except Exception:
                pass
        data[self.collection_name] = items
        try:
            with open(self.filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, default=str, indent=2)
        except Exception as e:
            print(f"Error writing to mock DB file: {e}")

    def find_one(self, query):
        items = self._read_data()
        for item in items:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                item_copy = item.copy()
                if '_id' not in item_copy:
                    item_copy['_id'] = item_copy.get('id', str(uuid.uuid4()))
                return item_copy
        return None

    def insert_one(self, document):
        items = self._read_data()
        doc_copy = document.copy()
        if '_id' not in doc_copy:
            doc_copy['_id'] = str(uuid.uuid4())
        items.append(doc_copy)
        self._write_data(items)
        # Modify the original document in place, matching MongoDB's behavior
        if '_id' not in document:
            document['_id'] = doc_copy['_id']
        return type('InsertOneResult', (), {'inserted_id': doc_copy['_id']})()

    def find(self, query=None):
        if query is None:
            query = {}
        items = self._read_data()
        matched = []
        for item in items:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                item_copy = item.copy()
                if '_id' not in item_copy:
                    item_copy['_id'] = item_copy.get('id', str(uuid.uuid4()))
                matched.append(item_copy)
        
        class FindResult(list):
            def sort(self, key, direction=-1):
                reverse = True if direction == -1 else False
                def sort_key(x):
                    val = x.get(key)
                    return str(val) if val is not None else ""
                sorted_items = sorted(self, key=sort_key, reverse=reverse)
                return FindResult(sorted_items)
                
        return FindResult(matched)

    def create_index(self, *args, **kwargs):
        pass

class MockDatabase:
    def __init__(self, filename="local_db.json"):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_dir = os.path.join(base_dir, "data")
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
        self.filename = os.path.join(data_dir, filename)
        self.users = MockCollection(self.filename, "users")
        self.scans = MockCollection(self.filename, "scans")

# Attempt MongoDB Connection with short timeout to prevent startup hangs
db = None
try:
    from pymongo import MongoClient
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1500)
    # Trigger a connection check
    client.server_info()
    db = client[DB_NAME]
    print("Using MongoDB Database.")
except Exception as e:
    print(f"MongoDB not available or pymongo not installed. Falling back to local file database: {e}")
    db = MockDatabase()

def init_db():
    try:
        db.users.create_index("email", unique=True)
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing Database: {e}")

def get_db():
    return db
