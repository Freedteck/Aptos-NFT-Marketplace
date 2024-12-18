import React, { useState, useEffect } from "react";
import {
  Typography,
  Radio,
  message,
  Card,
  Row,
  Col,
  Pagination,
  Tag,
  Button,
  Modal,
  Select,
  Input,
} from "antd";
import { AptosClient } from "aptos";
import { useWallet } from "@aptos-labs/wallet-adapter-react";

const { Title } = Typography;
const { Meta } = Card;
const { Option } = Select;

const client = new AptosClient("https://fullnode.testnet.aptoslabs.com/v1");

type NFT = {
  id: number;
  owner: string;
  name: string;
  description: string;
  uri: string;
  price: number;
  for_sale: boolean;
  rarity: number;
};

interface MarketViewProps {
  marketplaceAddr: string;
}

const rarityColors: { [key: number]: string } = {
  1: "green",
  2: "blue",
  3: "purple",
  4: "orange",
};

const rarityLabels: { [key: number]: string } = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Super Rare",
};

const truncateAddress = (address: string, start = 6, end = 4) => {
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

const MarketView: React.FC<MarketViewProps> = ({ marketplaceAddr }) => {
  const { signAndSubmitTransaction } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [rarity, setRarity] = useState<"all" | number>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc"); // Sort order state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [isBuyModalVisible, setIsBuyModalVisible] = useState(false);
  const [selectedNft, setSelectedNft] = useState<NFT | null>(null);

  const [isTipModalVisible, setIsTipModalVisible] = useState(false);
  const [tipAmount, setTipAmount] = useState("0");
  const [tippingNft, setTippingNft] = useState<NFT | null>(null);

  useEffect(() => {
    handleFetchNfts(undefined);
  }, []);

  const handleFetchNfts = async (
    selectedRarity: number | undefined,
    sort: "asc" | "desc" = sortOrder // Default to the current state
  ) => {
    try {
      const response = await client.getAccountResource(
        marketplaceAddr,
        "0x2183e1e73c81b2246c1e2ad7c8b899719a76e08cae4f4df843b882a33b550f7f::NFTMarketplace::Marketplace"
      );
      const nftList = (response.data as { nfts: NFT[] }).nfts;

      const hexToUint8Array = (hexString: string): Uint8Array => {
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return bytes;
      };

      const decodedNfts = nftList.map((nft) => ({
        ...nft,
        name: new TextDecoder().decode(hexToUint8Array(nft.name.slice(2))),
        description: new TextDecoder().decode(
          hexToUint8Array(nft.description.slice(2))
        ),
        uri: new TextDecoder().decode(hexToUint8Array(nft.uri.slice(2))),
        price: nft.price / 100000000,
      }));

      const filteredNfts = decodedNfts.filter(
        (nft) =>
          nft.for_sale &&
          (selectedRarity === undefined || nft.rarity === selectedRarity)
      );

      // Sort based on the provided sortOrder parameter
      filteredNfts.sort((a, b) =>
        sort === "asc" ? a.price - b.price : b.price - a.price
      );

      setNfts(filteredNfts);
      setCurrentPage(1); // Reset to first page after fetch
    } catch (error) {
      console.error("Error fetching NFTs:", error);
      message.error("Failed to fetch NFTs.");
    }
  };

  const handleSortChange = (value: "asc" | "desc") => {
    setSortOrder(value);
    // Use the updated value directly for sorting
    handleFetchNfts(rarity === "all" ? undefined : rarity, value);
  };

  const handleBuyClick = (nft: NFT) => {
    setSelectedNft(nft);
    setIsBuyModalVisible(true);
  };

  const handleCancelBuy = () => {
    setIsBuyModalVisible(false);
    setSelectedNft(null);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedNft) return;

    try {
      const priceInOctas = selectedNft.price * 100000000;

      console.log("Purchasing NFT:", priceInOctas);

      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::purchase_nft`,
        type_arguments: [],
        arguments: [
          marketplaceAddr,
          selectedNft.id.toString(),
          priceInOctas.toString(),
        ],
      };

      console.log("Purchasing NFT with payload:", entryFunctionPayload);

      const response = await (window as any).aptos.signAndSubmitTransaction(
        entryFunctionPayload
      );
      await client.waitForTransaction(response.hash);

      message.success("NFT purchased successfully!");
      setIsBuyModalVisible(false);
      handleFetchNfts(rarity === "all" ? undefined : rarity); // Refresh NFT list
      console.log("signAndSubmitTransaction:", signAndSubmitTransaction);
    } catch (error) {
      console.error("Error purchasing NFT:", error);
      message.error("Failed to purchase NFT.");
    }
  };

  const handleTipClick = (nft: NFT) => {
    setTippingNft(nft);
    setSelectedNft(nft);
    setIsTipModalVisible(true);
  };

  const handleCancelTip = () => {
    setIsTipModalVisible(false);
    setTippingNft(null);
  };

  const handleConfirmTip = async () => {
    if (!tippingNft) return;

    try {
      const tipAmountInOctas = Number(tipAmount) * 100000000;

      const entryFunctionPayload = {
        type: "entry_function_payload",
        function: `${marketplaceAddr}::NFTMarketplace::tip_owner`,
        type_arguments: [],
        arguments: [
          tippingNft.owner,
          tippingNft.id.toString(),
          tipAmountInOctas.toString(),
        ],
      };

      const response = await (window as any).aptos.signAndSubmitTransaction(
        entryFunctionPayload
      );
      await client.waitForTransaction(response.hash);

      message.success("Tip sent successfully!");
      setIsTipModalVisible(false);
      setTipAmount("0");
      setTippingNft(null);
    } catch (error) {
      console.error("Error sending tip:", error);
      message.error("Failed to send tip.");
    }
  };

  const predefinedTipValues = [0.1, 0.5, 1, 5];

  const paginatedNfts = nfts.slice(
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
        Marketplace
      </Title>

      {/* Filter and Sort */}
      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          justifyContent: "center",
          gap: "20px",
        }}
      >
        {/* Rarity Filter */}
        <Radio.Group
          value={rarity}
          onChange={(e) => {
            const selectedRarity = e.target.value;
            setRarity(selectedRarity);
            handleFetchNfts(
              selectedRarity === "all" ? undefined : selectedRarity
            );
          }}
          buttonStyle="solid"
        >
          <Radio.Button value="all">All</Radio.Button>
          <Radio.Button value={1}>Common</Radio.Button>
          <Radio.Button value={2}>Uncommon</Radio.Button>
          <Radio.Button value={3}>Rare</Radio.Button>
          <Radio.Button value={4}>Super Rare</Radio.Button>
        </Radio.Group>

        {/* Sort Dropdown */}
        <Select
          value={sortOrder}
          onChange={handleSortChange}
          style={{ width: "150px" }}
        >
          <Option value="asc">Price: Low to High</Option>
          <Option value="desc">Price: High to Low</Option>
        </Select>
      </div>

      {/* NFT Cards */}
      <Row
        gutter={[24, 24]}
        style={{
          marginTop: 20,
          width: "100%",
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {paginatedNfts.map((nft) => (
          <Col key={nft.id} xs={24} sm={12} md={8} lg={6} xl={6}>
            <Card
              hoverable
              style={{ width: "100%", maxWidth: "240px", margin: "0 auto" }}
              cover={<img alt={nft.name} src={nft.uri} />}
              actions={[
                <Button type="link" onClick={() => handleBuyClick(nft)}>
                  Buy
                </Button>,
                <Button type="link" onClick={() => handleTipClick(nft)}>
                  Tip
                </Button>,
              ]}
            >
              <Tag
                color={rarityColors[nft.rarity]}
                style={{
                  fontSize: "14px",
                  fontWeight: "bold",
                  marginBottom: "10px",
                }}
              >
                {rarityLabels[nft.rarity]}
              </Tag>
              <Meta title={nft.name} description={`Price: ${nft.price} APT`} />
              <p>{nft.description}</p>
              <p>ID: {nft.id}</p>
              <p>Owner: {truncateAddress(nft.owner)}</p>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Pagination */}
      <div style={{ marginTop: 30, marginBottom: 30 }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={nfts.length}
          onChange={(page) => setCurrentPage(page)}
          style={{ display: "flex", justifyContent: "center" }}
        />
      </div>

      {/* Buy Modal */}
      <Modal
        title="Purchase NFT"
        open={isBuyModalVisible}
        onCancel={handleCancelBuy}
        footer={[
          <Button key="cancel" onClick={handleCancelBuy}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmPurchase}>
            Confirm Purchase
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p>
              <strong>NFT ID:</strong> {selectedNft.id}
            </p>
            <p>
              <strong>Name:</strong> {selectedNft.name}
            </p>
            <p>
              <strong>Description:</strong> {selectedNft.description}
            </p>
            <p>
              <strong>Rarity:</strong> {rarityLabels[selectedNft.rarity]}
            </p>
            <p>
              <strong>Price:</strong> {selectedNft.price} APT
            </p>
          </>
        )}
      </Modal>

      {/* Tip Modal */}
      <Modal
        title="Send Tip"
        open={isTipModalVisible}
        onCancel={() => setIsTipModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={handleCancelTip}>
            Cancel
          </Button>,
          <Button key="confirm" type="primary" onClick={handleConfirmTip}>
            Send Tip
          </Button>,
        ]}
      >
        {selectedNft && (
          <>
            <p>
              <strong>NFT ID:</strong> {selectedNft.id}
            </p>
            <p>
              <strong>Owner:</strong> {truncateAddress(selectedNft.owner)}
            </p>
            <p>
              <strong>Tip Amount (APT):</strong>
            </p>
            <Input
              type="number"
              step="0.001"
              value={tipAmount !== null ? tipAmount.toString() : ""}
              onChange={(e) => {
                const input = e.target.value;
                setTipAmount(input);
              }}
              placeholder="Enter tip amount"
              style={{ marginBottom: "10px" }}
            />
            <div>
              {predefinedTipValues.map((value) => (
                <Button
                  key={value}
                  onClick={() => setTipAmount(value.toString())}
                  style={{ margin: "0 5px" }}
                >
                  {value} APT
                </Button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default MarketView;
