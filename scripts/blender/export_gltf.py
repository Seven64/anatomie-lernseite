#!/usr/bin/env python3
"""
Blender Export Script for Z-Anatomy Models
Exports each body system collection as a Draco-compressed GLB file
and generates structures.json with metadata.

Usage:
    blender --background --python scripts/blender/export_gltf.py

Requirements:
    - Blender 4.0+
    - Z-Anatomy Startup.blend in _source/
"""

import bpy
import json
import os
import re
import struct
import sys
from pathlib import Path
from typing import Dict, List, Any

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configuration
SOURCE_BLEND = Path("_source/Z-Anatomy/Startup.blend")  # Adjust if needed
EXPORT_DIR = Path("public/models")
STRUCTURES_JSON = Path("public/structures.json")

# Body system mapping: Blender collection name -> our system ID
SYSTEM_MAPPING = {
    "1: Skeletal system": "skeletal",
    "4: Muscular system": "muscular",
    "3: Joints": "articular",
    "5: Cardiovascular system": "cardiovascular",
    "6: Lymphoid organs": "lymphatic",
    "7: Nervous system & Sense organs": "nervous",
    "8: Visceral systems": "visceral",
    "9: Regions of human body": "regions",
    "2: Muscular insertions": "insertions",
}

# Region mapping (optional, can be extended)
REGION_MAPPING = {
    "Head": "head",
    "Neck": "neck",
    "Thorax": "thorax",
    "Abdomen": "abdomen",
    "Pelvis": "pelvis",
    "Upper Limb": "upper_limb",
    "Lower Limb": "lower_limb",
    "Back": "back",
}

# Language translations (from Z-Anatomy __init__.py)
TRANSLATIONS = {
    "latin": "Latin",
    "english": "English",
    "german": "German",
    "french": "French",
    "spanish": "Spanish",
    "portuguese": "Portuguese",
    "russian": "Russian",
    "chinese": "Chinese",
    "japanese": "Japanese",
    "korean": "Korean",
}

def clean_name(name: str) -> str:
    """Clean object name for use as ID (from Z-Anatomy)."""
    return name.lower().replace(" ", "_").replace(".", "").replace(",", "").replace("(", "").replace(")", "").replace("-", "_").replace("/", "_")

def build_structure_ids(objects: List[bpy.types.Object]) -> Dict[str, str]:
    structure_ids = {}
    used_ids = set()

    for obj in objects:
        structure_id = clean_name(obj.name)
        if obj.type == 'CURVE':
            structure_id = re.sub(r"[^a-z0-9_]+", "_", structure_id).strip("_") or "curve"

        base_id = structure_id
        suffix = f"_{obj.type.lower()}"
        duplicate_index = 2
        while structure_id in used_ids:
            structure_id = f"{base_id}{suffix}{duplicate_index}"
            duplicate_index += 1

        structure_ids[obj.name] = structure_id
        used_ids.add(structure_id)

    return structure_ids

def get_object_hierarchy(obj: bpy.types.Object) -> List[str]:
    """Get all parent names up to root (from Z-Anatomy family_all)."""
    parents = []
    current = obj.parent
    while current:
        parents.append(current.name)
        current = current.parent
    return parents

def find_collection_for_object(obj: bpy.types.Object) -> str:
    """Find which top-level collection an object belongs to."""
    for coll in obj.users_collection:
        # Walk up collection hierarchy
        current = coll
        while current:
            if current.name in SYSTEM_MAPPING:
                return SYSTEM_MAPPING[current.name]
            current = current.parent if hasattr(current, 'parent') else None
    return "unknown"

def find_region_for_object(obj: bpy.types.Object) -> str:
    """Find region from collection hierarchy."""
    for coll in obj.users_collection:
        current = coll
        while current:
            if current.name in REGION_MAPPING:
                return REGION_MAPPING[current.name]
            current = current.parent if hasattr(current, 'parent') else None
    return "unknown"

def get_source_material_color(material: bpy.types.Material) -> tuple:
    """Resolve a representative source color from Blender material nodes."""
    fallback = tuple(material.diffuse_color)

    def find_color(node_tree: bpy.types.NodeTree, depth: int = 0):
        if depth > 8:
            return None

        for node in node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                color_socket = node.inputs.get("Base Color")
                if not color_socket:
                    continue
                if color_socket.is_linked:
                    source = color_socket.links[0].from_node
                    if source.type == 'RGB':
                        return tuple(source.outputs[0].default_value)
                    if source.type == 'VALTORGB':
                        return tuple(source.color_ramp.evaluate(0.5))
                    if source.type == 'GROUP' and source.node_tree:
                        color = find_color(source.node_tree, depth + 1)
                        if color:
                            return color
                return tuple(color_socket.default_value)

            if node.type == 'GROUP' and node.node_tree:
                color = find_color(node.node_tree, depth + 1)
                if color:
                    return color

        return None

    color = find_color(material.node_tree) if material.use_nodes else None
    return color if color else fallback

def create_gltf_material(
    source: bpy.types.Material,
    material_cache: Dict[str, bpy.types.Material]
) -> bpy.types.Material:
    """Flatten a Blender material into a GLTF-compatible Principled material."""
    if source.name in material_cache:
        return material_cache[source.name]

    material = bpy.data.materials.new(f"{source.name}__gltf")
    material.diffuse_color = get_source_material_color(source)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    principled = nodes.new('ShaderNodeBsdfPrincipled')
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Alpha"].default_value = material.diffuse_color[3]
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material_cache[source.name] = material
    return material

def add_placeholder_glb_materials(
    export_path: Path,
    objects: List[bpy.types.Object],
    material_cache: Dict[str, bpy.types.Material],
) -> None:
    """Restore flattened material colors to a GLB exported with placeholder materials."""
    data = export_path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError(f"Invalid GLB header: {export_path}")

    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"GLB JSON chunk is missing: {export_path}")

    document = json.loads(data[20:20 + json_length])
    gltf_materials = document.setdefault("materials", [])
    material_indices = {}
    for material in material_cache.values():
        material_indices[material.name] = len(gltf_materials)
        color = [float(value) for value in material.diffuse_color]
        gltf_material = {
            "doubleSided": True,
            "name": material.name,
            "pbrMetallicRoughness": {
                "baseColorFactor": color,
                "metallicFactor": 0,
                "roughnessFactor": 0.5,
            },
        }
        if color[3] < 1:
            gltf_material["alphaMode"] = "BLEND"
        gltf_materials.append(gltf_material)

    material_slots = {}
    for obj in objects:
        obj.data.calc_loop_triangles()
        used_indices = sorted({triangle.material_index for triangle in obj.data.loop_triangles})
        material_slots[obj.get("atlasObjectName", obj.name)] = (
            [slot.material for slot in obj.material_slots],
            used_indices,
        )

    for node in document.get("nodes", []):
        object_name = node.get("extras", {}).get("atlasObjectName")
        mesh_index = node.get("mesh")
        if object_name not in material_slots or mesh_index is None:
            continue

        slots, used_indices = material_slots[object_name]
        primitives = document["meshes"][mesh_index]["primitives"]
        if not used_indices:
            continue
        if len(primitives) != len(used_indices):
            raise ValueError(
                f"Primitive/material mismatch for {object_name}: "
                f"{len(primitives)} primitives, {len(used_indices)} material groups"
            )

        for primitive, slot_index in zip(primitives, used_indices):
            if slot_index >= len(slots) or slots[slot_index] is None:
                continue
            material_index = material_indices.get(slots[slot_index].name)
            if material_index is None:
                raise ValueError(f"Missing flattened material: {slots[slot_index].name}")
            primitive["material"] = material_index

    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((4 - len(json_data) % 4) % 4)
    remaining_chunks = data[20 + json_length:]
    total_length = 12 + 8 + len(json_data) + len(remaining_chunks)
    header = struct.pack("<III", magic, version, total_length)
    json_chunk = struct.pack("<II", len(json_data), json_type) + json_data
    export_path.write_bytes(header + json_chunk + remaining_chunks)

def export_system(system_name: str, system_id: str, export_dir: Path) -> List[Dict[str, Any]]:
    """Export mesh and curve objects in a system collection as a single GLB."""
    structures = []

    # Find the collection
    collection = None
    for coll in bpy.data.collections:
        if coll.name == system_name:
            collection = coll
            break

    if not collection:
        print(f"  ⚠️  Collection '{system_name}' not found, skipping")
        return structures

    print(f"  📦 Processing {system_name} ({system_id})...")

    # Create a temporary collection for export
    temp_coll = bpy.data.collections.new(f"temp_export_{system_id}")
    bpy.context.scene.collection.children.link(temp_coll)

    exported_objects = []
    temporary_objects = []
    export_material_cache: Dict[str, bpy.types.Material] = {}

    def get_export_material(material: bpy.types.Material) -> bpy.types.Material:
        return create_gltf_material(material, export_material_cache)

    structure_objects = [
        obj for obj in collection.all_objects
        if obj.type in {'MESH', 'CURVE'}
    ]
    depsgraph = bpy.context.evaluated_depsgraph_get()

    for obj in structure_objects:
        if obj.type == 'MESH':
            export_obj = obj.copy()
            export_obj.data = obj.data.copy()
            export_obj["atlasObjectName"] = obj.name
            temp_coll.objects.link(export_obj)
            for slot in export_obj.material_slots:
                if slot.material:
                    slot.material = get_export_material(slot.material)
            temporary_objects.append(export_obj)
            exported_objects.append(obj)
            continue

        evaluated_obj = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated_obj, depsgraph=depsgraph)
        if not mesh.polygons:
            bpy.data.meshes.remove(mesh)
            continue

        materials = [slot.material for slot in obj.material_slots]
        mesh.materials.clear()
        for material in materials:
            mesh.materials.append(get_export_material(material) if material else None)
        converted_obj = bpy.data.objects.new(obj.name, mesh)
        converted_obj["atlasObjectName"] = obj.name
        temp_coll.objects.link(converted_obj)
        converted_obj.matrix_world = obj.matrix_world.copy()
        temporary_objects.append(converted_obj)
        exported_objects.append(obj)

    def cleanup_temp_export() -> None:
        for obj in temporary_objects:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in export_material_cache.values():
            if material.users == 0:
                bpy.data.materials.remove(material)
        bpy.data.collections.remove(temp_coll)

    # Select all objects in temp collection
    bpy.ops.object.select_all(action='DESELECT')
    for obj in temp_coll.objects:
        obj.select_set(True)

    if not temp_coll.objects:
        print(f"    No mesh or renderable curve objects in {system_name}")
        cleanup_temp_export()
        return structures

    # Set active object
    bpy.context.view_layer.objects.active = temp_coll.objects[0]

    # Export as GLB with Draco compression
    export_path = export_dir / system_id / f"{system_id}.glb"
    # Ensure export directory exists
    export_path.parent.mkdir(parents=True, exist_ok=True)

    # Keep the source materials so the original anatomical colors survive GLB export.
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(export_path.resolve()),
            export_format='GLB',
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12,
            export_draco_color_quantization=10,
            export_draco_generic_quantization=12,
            export_apply=True,
            export_yup=True,
            use_selection=True,
            export_extras=True,
            export_materials='EXPORT',
        )
        print(f"    ✅ Exported (Draco, flattened source materials): {export_path}")
    except Exception as e:
        print(f"    ⚠️  Draco export failed: {e}")
        # Fallback without Draco
        try:
            bpy.ops.export_scene.gltf(
                filepath=str(export_path.resolve()),
                export_format='GLB',
                export_draco_mesh_compression_enable=False,
                export_apply=True,
                export_yup=True,
                use_selection=True,
                export_extras=True,
                export_materials='EXPORT',
            )
            print(f"    ✅ Exported (no Draco, flattened source materials): {export_path}")
        except Exception as e2:
            print(f"    ❌ Export failed (fallback): {e2}")
            try:
                bpy.ops.export_scene.gltf(
                    filepath=str(export_path.resolve()),
                    export_format='GLB',
                    export_draco_mesh_compression_enable=False,
                    export_apply=True,
                    export_yup=True,
                    use_selection=True,
                    export_extras=True,
                    export_materials='PLACEHOLDER',
                )
                add_placeholder_glb_materials(
                    export_path,
                    temporary_objects,
                    export_material_cache,
                )
                print(f"    ✅ Exported with flattened materials via placeholder fallback: {export_path}")
            except Exception as e3:
                print(f"    ❌ Export failed (placeholder fallback): {e3}")
                cleanup_temp_export()
                return structures

    print(f"    📊 Generating metadata from {len(exported_objects)} mesh and curve objects...")
    structure_ids = build_structure_ids(exported_objects)
    for obj in exported_objects:
        region = find_region_for_object(obj)

        # Get translations from Z-Anatomy (if available in custom properties)
        name_latin = obj.get("name_latin", obj.name)
        name_de = obj.get("name_german", "")
        name_en = obj.get("name_english", "")

        structure = {
            "id": structure_ids[obj.name],
            "nameLatin": name_latin,
            "nameDe": name_de if name_de else None,
            "nameEn": name_en if name_en else None,
            "system": system_id,
            "region": region,
            "objectName": obj.name,
            "glbFile": f"{system_id}/{system_id}.glb",
            "parentId": (
                structure_ids.get(obj.parent.name, clean_name(obj.parent.name))
                if obj.parent else None
            ),
            "childrenIds": [
                structure_ids[child.name]
                for child in obj.children
                if child.name in structure_ids
            ],
        }
        structures.append({key: value for key, value in structure.items() if value is not None})

    curve_count = sum(obj.type == 'CURVE' for obj in exported_objects)
    print(f"    📊 Generated {len(structures)} structures ({len(exported_objects) - curve_count} meshes, {curve_count} curves)")

    cleanup_temp_export()

    return structures

def main():
    print("🔬 Z-Anatomy GLB Export Pipeline")
    print("=" * 50)

    # Load source blend file
    source_blend = SOURCE_BLEND
    if not source_blend.exists():
        # Try alternative location
        alt_path = Path("_source/Startup.blend")
        if alt_path.exists():
            source_blend = alt_path
        else:
            print(f"❌ Source file not found: {SOURCE_BLEND}")
            print("   Please place Z-Anatomy Startup.blend in _source/")
            sys.exit(1)

    print(f"📂 Loading: {source_blend}")
    bpy.ops.wm.open_mainfile(filepath=str(source_blend))

    # Prepare export directory
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    all_structures = []

    # Export each system
    for system_name, system_id in SYSTEM_MAPPING.items():
        structures = export_system(system_name, system_id, EXPORT_DIR)
        all_structures.extend(structures)
        print(f"    📋 Found {len(structures)} structures")

    # Write structures.json
    print(f"\n📝 Writing structures.json ({len(all_structures)} structures)...")
    STRUCTURES_JSON.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "version": "1.1",
        "source": "Z-Anatomy Models of Human Anatomy",
        "license": "CC BY-SA 4.0",
        "exported": __import__('datetime').datetime.now().isoformat(),
        "structures": all_structures,
    }

    with open(STRUCTURES_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"✅ Done! Exported to {EXPORT_DIR}")
    print(f"📄 Structures: {STRUCTURES_JSON}")
    print(f"\n📊 Summary:")
    print(f"   Total structures: {len(all_structures)}")
    by_system = {}
    for s in all_structures:
        by_system[s['system']] = by_system.get(s['system'], 0) + 1
    for sys, count in sorted(by_system.items()):
        print(f"   {sys}: {count}")

if __name__ == "__main__":
    main()