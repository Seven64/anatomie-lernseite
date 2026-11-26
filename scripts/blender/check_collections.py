import bpy

import os

# Aus dem Projekt-Root starten: blender --background --python scripts/blender/check_collections.py
bpy.ops.wm.open_mainfile(filepath=os.path.join('_source', 'Z-Anatomy', 'Startup.blend'))

print('Exact collection names:')
for coll in bpy.data.collections:
    if len(coll.all_objects) > 0:
        print(f'  "{coll.name}" (objects: {len(coll.all_objects)})')