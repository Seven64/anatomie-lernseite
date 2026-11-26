import bpy

bpy.ops.wm.open_mainfile(filepath=r'_source\Z-Anatomy\Startup.blend')

# Check export operator parameters
import bl_operators
print("GLTF export operator properties:")
try:
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    for prop in props:
        print(f"  {prop.identifier}: {prop.type}")
except Exception as e:
    print(f"Error: {e}")