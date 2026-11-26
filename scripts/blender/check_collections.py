import bpy

bpy.ops.wm.open_mainfile(filepath=r'_source\Z-Anatomy\Startup.blend')

print('Exact collection names:')
for coll in bpy.data.collections:
    if len(coll.all_objects) > 0:
        print(f'  "{coll.name}" (objects: {len(coll.all_objects)})')