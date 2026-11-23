import sys
src = "/root/hetzner/ai-engine/app/routes/soma_logs.py"
html_path = "/tmp/new_dashboard.html"

with open(html_path, "r", encoding="utf-8") as f:
    new_html = f.read()

with open(src, "r", encoding="utf-8") as f:
    lines = f.readlines()

start_line = None
end_line = None
for i, line in enumerate(lines, 1):
    if line.startswith("_DASHBOARD = r"):
        start_line = i
    elif start_line and line.rstrip().endswith('"""') and not line.startswith("_DASHBOARD") and end_line is None:
        end_line = i
        break

if not start_line or not end_line:
    print(f"start={start_line}, end={end_line}")
    print("Could not find boundaries!")
    sys.exit(1)

print(f"Replacing lines {start_line}–{end_line}")

prefix = lines[:start_line]
suffix = lines[end_line:]

new_html = new_html.rstrip("\n")

out = (
    "".join(prefix)
    + "_DASHBOARD = r\"\"\"" + new_html + "\"\"\"\n"
    + "".join(suffix)
)

with open(src, "w", encoding="utf-8") as f:
    f.write(out)

print("Done")
