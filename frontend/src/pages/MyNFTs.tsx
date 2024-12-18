import React, { useEffect, useState, useCallback } from "react";
import {
  Typography,
  Card,
  Row,
  Col,
  Pagination,
  message,
  Button,
  Input,
  Modal,
  Select,
} from "antd";
import { AptosClient } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Title } = Typography;
const { Meta } = Card;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

type NFT = {
  id: number;
  name: string;
  description: string;
  uri: string;
  rarity: number;
  price: number;
  for_sale: boolean;
};

const MyNFTs: React.FC = () => {
  const pageSize = 8;
  const [currentPage, setCurrentPage] = useState(1);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [totalNFTs, setTotalNFTs] = useState(0);
  const { account } = useWallet();
  const marketplaceAddr =
    "0x2183e1e73c81b2246c1e2ad7c8b899719a76e08cae4f4df843b882a33b550f7f";

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);
  const [salePrice, setSalePrice] = useState<string>("");

  // Filter and Sort state
  const [filterRarity, setFilterRarity] = useState<string | undefined>(
    undefined
  );
  const [filterPriceRange, setFilterPriceRange] = useState<
    [number, number] | undefined
  >(undefined);
  const [sortOrder, setSortOrder] = useState<string>("price");

  const [isGiftModalVisible, setIsGiftModalVisible] = useState(false);
  const [selectedGiftNft, setSelectedGiftNft] = useState<NFT | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");

  const fetchUserNFTs = useCallback(async () => {
    if (!account) return;

    try {
      console.log("Fetching NFT IDs for owner:", account.address);

      const nftIdsResponse = await client.view({
        function: `${marketplaceAddr}::NFTMarketplace::get_all_nfts_for_owner`,
        arguments: [marketplaceAddr, account.address, "100", "0"],
        type_arguments: [],
      });

      const nftIds = Array.isArray(nftIdsResponse[0])
        ? nftIdsResponse[0]
        : nftIdsResponse;
      setTotalNFTs(nftIds.length);

      if (nftIds.length === 0) {
        console.log("No NFTs found for the owner.");
        setNfts([]);
        return;
      }

      console.log("Fetching details for each NFT ID:", nftIds);

      const userNFTs = (
        await Promise.all(
          nftIds.map(async (id) => {
            try {
              const nftDetails = await client.view({
                function: `${marketplaceAddr}::NFTMarketplace::get_nft_details`,
                arguments: [marketplaceAddr, id],
                type_arguments: [],
              });

              const [
                nftId,
                owner,
                name,
                description,
                uri,
                price,
                forSale,
                rarity,
              ] = nftDetails as [
                number,
                string,
                string,
                string,
                string,
                number,
                boolean,
                number
              ];

              const hexToUint8Array = (hexString: string): Uint8Array => {
                const bytes = new Uint8Array(hexString.length / 2);
                for (let i = 0; i < hexString.length; i += 2) {
                  bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
                }
                return bytes;
              };

              return {
                id: nftId,
                name: new TextDecoder().decode(hexToUint8Array(name.slice(2))),
                description: new TextDecoder().decode(
                  hexToUint8Array(description.slice(2))
                ),
                uri: new TextDecoder().decode(hexToUint8Array(uri.slice(2))),
                rarity,
                price: price / 100000000, // Convert octas to APT
                for_sale: forSale,
              };
            } catch (error) {
              console.error(`Error fetching details for NFT ID ${id}:`, error);
              return null;
            }
          })
        )
      ).filter((nft): nft is NFT => nft !== null);

      console.log("User NFTs:", userNFTs);

      // Apply Filters
      let filteredNFTs = userNFTs;

      // Filter by Rarity
      if (filterRarity && filterRarity !== "all") {
        filteredNFTs = filteredNFTs.filter(
          (nft) => nft.rarity === parseInt(filterRarity)
        );
      }

      // Filter by Price Range
      if (filterPriceRange) {
        filteredNFTs = filteredNFTs.filter(
          (nft) =>
            nft.price >= filterPriceRange[0] && nft.price <= filterPriceRange[1]
        );
      }

      // Sort NFTs based on selected criteria
      if (sortOrder === "price") {
        filteredNFTs = filteredNFTs.sort((a, b) => a.price - b.price);
      } else if (sortOrder === "rarity") {
        filteredNFTs = filteredNFTs.sort((a, b) => a.rarity - b.rarity);
      }

      setNfts(filteredNFTs);
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      message.error("Failed to fetch your NFTs.");
    }
  }, [account, marketplaceAddr, filterRarity, filterPriceRange, sortOrder]);

  const handleSellClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedNft(null);
    setSalePrice("");
  };

  const handleConfirmListing = async () => {
    if (!selectedNft || !salePrice) return;

    try {
      const priceInOctas = parseFloat(salePrice) * 100000000;

      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::list_for_sale`,
        type_arguments: [],
        arguments: [
          marketplaceAddr,
          selectedNft.id.toString(),
          priceInOctas.toString(),
        ],
      };

      // Bypass type checking
      const response = await (window as any).aptos.signAndSubmitTransaction(
        entryFunctionPayload
      );
      await client.waitForTransaction(response.hash);

      message.success("NFT listed for sale successfully!");
      setIsModalVisible(false);
      setSalePrice("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error listing NFT for sale:", error);
      message.error("Failed to list NFT for sale.");
    }
  };

  useEffect(() => {
    fetchUserNFTs();
  }, [fetchUserNFTs, currentPage]);

  // Show Gift Modal
  const handleGiftClick = (nft: NFT) => {
    setSelectedGiftNft(nft);
    setIsGiftModalVisible(true);
  };

  // Close Gift Modal
  const handleGiftCancel = () => {
    setIsGiftModalVisible(false);
    setSelectedGiftNft(null);
    setRecipientAddress("");
  };

  // Confirm and Execute NFT Gift Transfer
  const handleConfirmGift = async () => {
    if (!selectedGiftNft || !recipientAddress) {
      message.error("Recipient address is required.");
      return;
    }

    try {
      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::transfer_ownership`,
        type_arguments: [],
        arguments: [
          marketplaceAddr,
          selectedGiftNft.id.toString(),
          recipientAddress,
        ],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(
        entryFunctionPayload
      );
      await client.waitForTransaction(response.hash);

      message.success("NFT gifted successfully!");
      setIsGiftModalVisible(false);
      setRecipientAddress("");
      fetchUserNFTs();
    } catch (error) {
      console.error("Error transferring NFT ownership:", error);
      message.error("Failed to transfer NFT ownership.");
    }
  };

  const paginatedNFTs = nfts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Title level={2} style={{ marginBottom: "20px" }}>
        My Collection
      </Title>
      <p>Your personal collection of NFTs.</p>

      {/* Filters and Sorting */}
      <Row gutter={[24, 24]} style={{ marginBottom: "20px" }}>
        <Col>
          <Select
            style={{ width: 200 }}
            placeholder="Filter by Rarity"
            onChange={(value) => {
              setFilterRarity(value);
              console.log("value", value);
            }}
            defaultValue="all"
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value="1">Common</Select.Option>
            <Select.Option value="2">Uncommon</Select.Option>
            <Select.Option value="3">Rare</Select.Option>
            <Select.Option value="4">Super Rare</Select.Option>
          </Select>
        </Col>
        <Col>
          <Select
            style={{ width: 200 }}
            placeholder="Price Range"
            onChange={(value) => {
              if (value === "all") {
                setFilterPriceRange(undefined);
              } else {
                setFilterPriceRange(JSON.parse(value)); // Parse the stringified array
                console.log("value", JSON.parse(value));
              }
            }}
            defaultValue="all"
          >
            <Select.Option value="all">All</Select.Option>
            <Select.Option value={JSON.stringify([0, 10])}>
              0 - 10 APT
            </Select.Option>
            <Select.Option value={JSON.stringify([10, 50])}>
              10 - 50 APT
            </Select.Option>
            <Select.Option value={JSON.stringify([50, 100])}>
              50 - 100 APT
            </Select.Option>
            <Select.Option value={JSON.stringify([100, Infinity])}>
              100+ APT
            </Select.Option>
          </Select>
        </Col>
        <Col>
          <Select
            style={{ width: 200 }}
            placeholder="Sort By"
            onChange={(value) => setSortOrder(value)}
            defaultValue="price"
          >
            <Select.Option value="price">Price</Select.Option>
            <Select.Option value="rarity">Rarity</Select.Option>
            <Select.Option value="all">All</Select.Option>
          </Select>
        </Col>
      </Row>

      {/* Card Grid */}
      <Row
        gutter={[24, 24]}
        style={{
          marginTop: 20,
          width: "100%",
          maxWidth: "100%",
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {paginatedNFTs.map((nft) => (
          <Col
            key={nft.id}
            xs={24}
            sm={12}
            md={8}
            lg={8}
            xl={6}
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Card
              hoverable
              style={{
                width: "100%",
                maxWidth: "280px",
                border: "1px solid #ddd",
              }}
              cover={<img alt="nft" src={nft.uri} />}
            >
              <Meta title={nft.name} description={nft.description} />
              <p>Price: {nft.price} APT</p>
              <Button
                onClick={() => handleSellClick(nft)}
                disabled={nft.for_sale}
              >
                {nft.for_sale ? "Already Listed" : "List for Sale"}
              </Button>
              <Button
                style={{ marginTop: "10px" }}
                onClick={() => handleGiftClick(nft)}
              >
                Gift
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Pagination */}
      <Pagination
        current={currentPage}
        total={totalNFTs}
        pageSize={pageSize}
        onChange={setCurrentPage}
        style={{ marginTop: "20px" }}
      />

      {/* Modal */}
      <Modal
        title="List NFT for Sale"
        open={isModalVisible}
        onOk={handleConfirmListing}
        onCancel={handleCancel}
        okText="Confirm Listing"
        cancelText="Cancel"
      >
        <p>Price (APT):</p>
        <Input
          type="number"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
        />
      </Modal>

      {/* Gift Modal */}
      <Modal
        title="Gift NFT"
        open={isGiftModalVisible}
        onOk={handleConfirmGift}
        onCancel={handleGiftCancel}
        okText="Confirm Gift"
        cancelText="Cancel"
      >
        <p>Recipient Address:</p>
        <Input
          placeholder="Enter recipient's address"
          value={recipientAddress}
          onChange={(e) => setRecipientAddress(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default MyNFTs;
