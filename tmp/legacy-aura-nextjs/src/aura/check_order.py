import os
import re

def check_files(directory):
    pattern = re.compile(r'\.(auth|public|internal)\(\)\s*\.entities', re.MULTILINE)
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                    if pattern.search(content):
                        print(f"FOUND INVALID ORDER IN: {path}")

if __name__ == "__main__":
    check_files('src/features')
