import bpy

import os

# Aus dem Projekt-Root starten: blender --background --python scripts/blender/list_collections.py
bpy.ops.wm.open_mainfile(filepath=os.path.join('_source', 'Z-Anatomy', 'Startup.blend'))

print('Collections in scene:')
for coll in bpy.data.collections:
    print(f'  {coll.name} (children: {len(coll.children)}, objects: {len(coll.all_objects)})')

# Also check top-level collections
print('\nTop-level collections in scene:')
for coll in bpy.context.scene.collection.children:
    print(f'  {coll.name}')